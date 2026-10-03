import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
	overpassQuery,
	parseOverpass,
	parseSights,
	rankSights,
	shortlist,
	toSight,
	type Candidate,
	type GeoPage,
	type Sight
} from '#lib/sights.ts';

const TIMEOUT_MS = 8000;
const OVERPASS_TIMEOUT_MS = 30000;
// Overpass is a volunteer-run service with a few mirrors; the second is tried if the first fails.
const OVERPASS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];
/** How far from the destination's centre to look. Sights are ranked, so a wide net is fine. */
const RADIUS_M = 30_000;
// Sights don't move; refresh weekly so page-view rankings stay roughly current.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
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
async function overpass(lat: number, lon: number, fetcher: typeof fetch): Promise<Candidate[]> {
	let last: unknown;
	for (const endpoint of OVERPASS) {
		try {
			const body = await getJson(
				endpoint,
				fetcher,
				{
					method: 'POST',
					body: new URLSearchParams({ data: overpassQuery(lat, lon, RADIUS_M) }),
					headers: { 'content-type': 'application/x-www-form-urlencoded' }
				},
				OVERPASS_TIMEOUT_MS
			);
			return parseOverpass(body);
		} catch (err) {
			last = err;
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
): Promise<Sight[]> {
	const picked = shortlist(await overpass(lat, lon, fetcher));
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
	return rankSights(sights);
}

/** The fallback when OpenStreetMap can't be reached: Wikipedia's own "near here" search, filtered. */
async function nearby(lat: number, lon: number, place: string, fetcher: typeof fetch) {
	const body = await getJson(
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
			pvipdays: '30'
		}),
		fetcher
	);
	return parseSights(body, 16, place, { lat, lon });
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
	// "v2": the first version's cached lists came from Wikipedia's geosearch.
	const key = `v2,${latitude.toFixed(3)},${longitude.toFixed(3)},${place}`;
	const hit = entries().get(key);
	if (hit && hit.expires > Date.now()) return Promise.resolve(hit.sights);
	// The trip page and the journey can ask at the same time; search once for both.
	let running = pending.get(key);
	if (!running) {
		running = search(key, latitude, longitude, place, fetcher).finally(() => pending.delete(key));
		pending.set(key, running);
	}
	return running;
}

async function search(
	key: string,
	latitude: number,
	longitude: number,
	place: string,
	fetcher: typeof fetch
): Promise<Sight[]> {
	let sights: Sight[] | null = null;
	let complete = true;
	try {
		sights = await attractions(latitude, longitude, place, fetcher);
	} catch (err) {
		console.warn(`Sights search near ${place} failed:`, (err as Error).message);
		complete = false;
		try {
			sights = await nearby(latitude, longitude, place, fetcher);
		} catch (err2) {
			console.warn(`Fallback sights search near ${place} failed:`, (err2 as Error).message);
		}
	}
	if (!sights || sights.length === 0) return entries().get(key)?.sights ?? [];
	// A fallback list is only kept briefly, so a later visit tries the good source again.
	await remember(key, { expires: Date.now() + (complete ? TTL_MS : RETRY_MS), sights });
	return sights;
}
