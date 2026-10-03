import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
	overpassPartial,
	overpassQuery,
	parseOverpass,
	parseSights,
	rankSights,
	uniqueSights,
	shortlist,
	toSight,
	type Candidate,
	type GeoPage,
	type Sight
} from '#lib/sights.ts';

const TIMEOUT_MS = 8000;
// Overpass is a volunteer-run service and often busy; there are several public mirrors, tried in turn.
const OVERPASS: [url: string, timeoutMs: number][] = [
	['https://overpass-api.de/api/interpreter', 55_000],
	['https://overpass.kumi.systems/api/interpreter', 12_000],
	['https://overpass.private.coffee/api/interpreter', 12_000]
];
/** Wikipedia's nearby search finds nothing but nearest-first pages, 10 km at most: pause between searches. */
/** Overridable so tests don't wait. */
export const timing = { pause: 250 };
/** A city's sights are within this; islands and regions need the wider second look. */
const NEAR_M = 15_000;
const WIDE_M = 40_000;
/** Fewer candidates than this near the centre means a spread-out place: look wider. */
const ENOUGH_NEAR = 20;
// Sights don't move; refresh weekly so page-view rankings stay roughly current.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 3 * 60 * 1000;
/** Fewer real sights than this after OpenStreetMap and Wikipedia: treat the place as sparse. */
const ENOUGH_SIGHTS = 12;
const pending = new Map<string, Promise<Sight[]>>();
type Entry = { expires: number; sights: Sight[] };
// Wikimedia asks API clients to say who they are and how to reach them.
const USER_AGENT = 'Jumpseat/1.0 (https://github.com/Soberat/jumpseat; self-hosted travel planner)';

/**
 * Found sights are kept in a file next to the database, so a restart or redeploy doesn't
 * send a fresh burst of searches (Wikipedia rate-limits by IP). Tests run without one.
 */
const cacheFile = process.env.DATABASE_URL
	? join(dirname(process.env.DATABASE_URL), 'sights-cache.json')
	: null;
let cache: Map<string, Entry> | null = null;
function entries(): Map<string, Entry> {
	if (cache) return cache;
	cache = new Map();
	try {
		if (cacheFile) cache = new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))));
	} catch {
		// No file yet, or unreadable: start empty.
	}
	return cache;
}
async function remember(key: string, entry: Entry) {
	entries().set(key, entry);
	if (!cacheFile) return;
	try {
		const tmp = `${cacheFile}.tmp`;
		await writeFile(tmp, JSON.stringify(Object.fromEntries(entries())));
		await rename(tmp, cacheFile);
	} catch (err) {
		console.warn('Could not save the sights cache:', (err as Error).message);
	}
}

class RateLimited extends Error {}

/** GETs or POSTs JSON from a Wikimedia or OpenStreetMap service; refusals become errors. */
async function getJson(
	url: URL | string,
	fetcher: typeof fetch,
	init: RequestInit = {},
	timeout = TIMEOUT_MS
): Promise<unknown> {
	const res = await fetcher(url, {
		...init,
		signal: AbortSignal.timeout(timeout),
		headers: { 'user-agent': USER_AGENT, ...init.headers }
	});
	if (res.status === 429) throw new RateLimited(`${new URL(url).host} answered 429`);
	if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		// "Too many requests" sometimes comes back as plain text with a 200.
		if (/too many requests|rate.?limit/i.test(text)) throw new RateLimited('too many requests');
		throw new Error(`${new URL(url).host} answered: ${text.slice(0, 80)}`);
	}
}

function api(host: string, params: Record<string, string>): URL {
	const url = new URL(`https://${host}/w/api.php`);
	for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) {
		url.searchParams.set(k, v);
	}
	return url;
}

/** Named, documented attractions around the destination, from OpenStreetMap. */
async function overpass(
	lat: number,
	lon: number,
	radiusM: number,
	wide: boolean,
	fetcher: typeof fetch
): Promise<{ candidates: Candidate[]; partial: boolean }> {
	let last: unknown;
	for (const [endpoint, timeoutMs] of OVERPASS) {
		try {
			const body = await getJson(
				endpoint,
				fetcher,
				{
					method: 'POST',
					body: new URLSearchParams({ data: overpassQuery(lat, lon, radiusM, wide) }),
					headers: { 'content-type': 'application/x-www-form-urlencoded' }
				},
				timeoutMs
			);
			return { candidates: parseOverpass(body), partial: overpassPartial(body) };
		} catch (err) {
			last = err;
			console.warn(`Overpass ${new URL(endpoint).host} failed:`, (err as Error).message);
		}
	}
	throw last;
}

const chunks = <T>(xs: T[], n: number) =>
	Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

/** English Wikipedia titles for Wikidata ids (up to 50 per request). */
async function englishTitles(ids: string[], fetcher: typeof fetch): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	for (const batch of chunks(ids, 50)) {
		const body = (await getJson(
			api('www.wikidata.org', {
				action: 'wbgetentities',
				ids: batch.join('|'),
				props: 'sitelinks',
				sitefilter: 'enwiki'
			}),
			fetcher
		)) as { entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }> };
		for (const [id, e] of Object.entries(body.entities ?? {})) {
			if (e.sitelinks?.enwiki?.title) out.set(id, e.sitelinks.enwiki.title);
		}
	}
	return out;
}

/** What English Wikipedia says about each title: a description, a picture and last month's readers. */
async function articles(titles: string[], fetcher: typeof fetch): Promise<Map<string, GeoPage>> {
	const out = new Map<string, GeoPage>();
	for (const batch of chunks(titles, 50)) {
		let more: Record<string, string> | undefined = {};
		// Page views come in batches; "continue" asks for the rest.
		for (let round = 0; more && round < 4; round++) {
			const body = (await getJson(
				api('en.wikipedia.org', {
					action: 'query',
					titles: batch.join('|'),
					redirects: '1',
					prop: 'description|pageimages|pageviews',
					piprop: 'thumbnail',
					pithumbsize: '160',
					pilimit: '50',
					pvipdays: '30',
					...more
				}),
				fetcher
			)) as { continue?: Record<string, string>; query?: { pages?: GeoPage[] } };
			for (const p of body.query?.pages ?? []) {
				out.set(p.title, { ...out.get(p.title), ...p });
			}
			more = body.continue;
		}
	}
	return out;
}

/** Things to see from OpenStreetMap, ranked by how many people read about them on Wikipedia. */
async function attractions(
	lat: number,
	lon: number,
	place: string,
	fetcher: typeof fetch
): Promise<{ sights: Sight[]; partial: boolean; sparse: boolean }> {
	const near = await overpass(lat, lon, NEAR_M, false, fetcher);
	let found = near.candidates;
	let partial = near.partial;
	if (found.length < ENOUGH_NEAR) {
		// A spread-out place: island, region, small town. Look further out, for the main kinds only.
		try {
			const wide = await overpass(lat, lon, WIDE_M, true, fetcher);
			const have = new Set(found.map((c) => c.wikidata));
			found = [...found, ...wide.candidates.filter((c) => !have.has(c.wikidata))];
			partial ||= wide.partial;
		} catch {
			partial = true;
		}
	}
	const picked = shortlist(found);
	const missing = picked.filter((c) => !c.title && c.wikidata).map((c) => c.wikidata!);
	const resolved = missing.length
		? await englishTitles(missing, fetcher)
		: new Map<string, string>();
	const withTitle = picked
		.map((c) => ({ c, title: c.title ?? resolved.get(c.wikidata ?? '') ?? null }))
		.filter((x): x is { c: Candidate; title: string } => !!x.title);
	const pages = await articles([...new Set(withTitle.map((x) => x.title))], fetcher);
	const sights = withTitle.flatMap(({ c, title }) => {
		const page = pages.get(title);
		const sight = page && toSight(c, page, { lat, lon }, place);
		return sight ? [sight] : [];
	});
	return {
		sights: rankSights(sights),
		partial,
		sparse: found.length < ENOUGH_NEAR || sights.length < ENOUGH_SIGHTS
	};
}

/** Search points in rings around the destination, 17 km apart so Wikipedia's 10 km circles leave no gaps. */
export function searchRings(lat: number, lon: number): { lat: number; lon: number }[][] {
	const STEP_KM = 17;
	const dLat = 1 / 111;
	const dLon = 1 / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
	const at = (km: number, deg: number) => ({
		lat: lat + km * dLat * Math.sin((deg * Math.PI) / 180),
		lon: lon + km * dLon * Math.cos((deg * Math.PI) / 180)
	});
	const six = (km: number, offset: number) =>
		Array.from({ length: 6 }, (_, i) => at(km, offset + i * 60));
	return [
		[{ lat, lon }],
		six(STEP_KM, 0),
		[...six(2 * STEP_KM, 0), ...six(Math.sqrt(3) * STEP_KM, 30)]
	];
}

/** One "near here" search, following "continue" so every article gets its page views. */
async function geosearch(lat: number, lon: number, fetcher: typeof fetch): Promise<unknown[]> {
	const bodies: unknown[] = [];
	let more: Record<string, string> | undefined = {};
	for (let round = 0; more && round < 4; round++) {
		const body = (await getJson(
			api('en.wikipedia.org', {
				action: 'query',
				generator: 'geosearch',
				ggscoord: `${lat}|${lon}`,
				ggsradius: '10000',
				ggslimit: '50',
				prop: 'coordinates|description|pageimages|pageviews',
				colimit: 'max',
				piprop: 'thumbnail',
				pithumbsize: '160',
				pilimit: '50',
				pvipdays: '30',
				...more
			}),
			fetcher
		)) as { continue?: Record<string, string> };
		bodies.push(body);
		more = body.continue;
	}
	return bodies;
}

/**
 * Wikipedia's own "near here" search over the first `rings` rings. On its own it is no good for
 * things to do (it returns events and accidents tied to a place, and in a dense city only the
 * nearest 50 articles), but on an island or in the countryside it finds the sights OpenStreetMap
 * has no Wikidata for. Stops at the first "too many requests".
 */
async function nearby(
	lat: number,
	lon: number,
	place: string,
	fetcher: typeof fetch,
	rings: number
): Promise<{ sights: Sight[]; partial: boolean }> {
	const bodies: unknown[] = [];
	let partial = false;
	search: for (const ring of searchRings(lat, lon).slice(0, rings)) {
		for (const p of ring) {
			try {
				bodies.push(...(await geosearch(p.lat, p.lon, fetcher)));
			} catch (err) {
				partial = true;
				console.warn(`Nearby search near ${place} failed:`, (err as Error).message);
				if (err instanceof RateLimited) break search;
			}
			await new Promise((r) => setTimeout(r, timing.pause));
		}
	}
	if (bodies.length === 0 && partial) throw new Error('no nearby search worked');
	return { sights: parseSights(bodies, 30, place, { lat, lon }), partial };
}

/**
 * Notable things to see in and around the destination. Places come from OpenStreetMap (only
 * named ones with a Wikidata entry, of kinds people visit), then Wikipedia says how many people
 * read about each, which ranks them. Wikipedia's own geosearch is no good for this on its own:
 * it returns events and accidents tied to a place ("1906 San Francisco earthquake").
 */
export function getNearbySights(
	latitude: number,
	longitude: number,
	place = '',
	fetcher = fetch
): Promise<Sight[]> {
	// "v4": earlier versions cached lists from other sources, some of them poor or too short.
	const key = `v4,${latitude.toFixed(3)},${longitude.toFixed(3)},${place}`;
	const hit = entries().get(key);
	if (hit && hit.expires > Date.now()) return Promise.resolve(hit.sights);
	// The trip page and the journey can ask at the same time; search once for both.
	let running = pending.get(key);
	if (!running) {
		running = search(key, latitude, longitude, place, fetcher).finally(() => pending.delete(key));
		pending.set(key, running);
	}
	// An out-of-date list beats a minute of waiting: show it now, refresh behind it.
	return hit ? Promise.resolve(hit.sights) : running;
}

async function search(
	key: string,
	latitude: number,
	longitude: number,
	place: string,
	fetcher: typeof fetch
): Promise<Sight[]> {
	let sights: Sight[] | null = null;
	let complete: boolean;
	try {
		const found = await attractions(latitude, longitude, place, fetcher);
		sights = found.sights;
		// Overpass sometimes gives up part-way and returns what it had: usable, but try again soon.
		complete = !found.partial;
		if (found.sparse) {
			// An island or the countryside: OpenStreetMap documents few places there, so add
			// what Wikipedia knows about, out to about 40 km.
			try {
				const extra = await nearby(latitude, longitude, place, fetcher, 3);
				sights = rankSights(uniqueSights([...sights, ...extra.sights]));
				complete &&= !extra.partial;
			} catch {
				complete = false;
			}
		}
	} catch (err) {
		console.warn(`Sights search near ${place} failed:`, (err as Error).message);
		complete = false;
		try {
			// OpenStreetMap is down: the centre and the first ring of Wikipedia's search will do.
			const fallback = await nearby(latitude, longitude, place, fetcher, 2);
			sights = rankSights(fallback.sights);
		} catch (err2) {
			console.warn(`Fallback sights search near ${place} failed:`, (err2 as Error).message);
		}
	}
	if (!sights || sights.length === 0) {
		// Nothing found: remember that for a while too, so each page load isn't a slow search.
		const kept = entries().get(key)?.sights ?? [];
		await remember(key, { expires: Date.now() + RETRY_MS, sights: kept });
		return kept;
	}
	// A fallback list is only kept briefly, so a later visit tries the good source again.
	await remember(key, { expires: Date.now() + (complete ? TTL_MS : RETRY_MS), sights });
	return sights;
}
