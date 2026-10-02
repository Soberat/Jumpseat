import { readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseSights, type Sight } from '#lib/sights.ts';

const TIMEOUT_MS = 5000;
// Sights don't move; refresh weekly so page-view rankings stay roughly current.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
/** Overridable so tests don't wait. */
export const timing = { pause: 250, retryAfter: 2000 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
/**
 * Geosearch reaches at most 10 km, so searches are laid out on a hex grid 17 km apart
 * (circles of 10 km then leave no gaps): the centre and a ring around it, then an outer ring
 * reaching about 40 km, for islands and regions whose sights are spread out.
 */
const STEP_KM = 17;
// A city centre easily turns up this many; an island's middle doesn't, and needs the outer ring.
const ENOUGH = 24;

/** Search points in rings around the destination: ring 0 is the centre. */
export function searchRings(lat: number, lon: number): { lat: number; lon: number }[][] {
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

const PARAMS = {
	action: 'query',
	format: 'json',
	formatversion: '2',
	generator: 'geosearch',
	ggsradius: '10000',
	ggslimit: '50',
	prop: 'coordinates|description|pageimages|pageviews',
	// Without this only the first 10 pages get coordinates.
	colimit: 'max',
	piprop: 'thumbnail',
	pithumbsize: '160',
	pilimit: '50',
	pvipdays: '30'
};

/**
 * One geosearch, following "continue" so every page gets its page views (they come in
 * batches). Throws on anything but a JSON answer, such as Wikipedia's rate-limit message.
 */
async function geosearch(lat: number, lon: number, fetcher: typeof fetch): Promise<unknown[]> {
	const bodies: unknown[] = [];
	let more: Record<string, string> | undefined = {};
	for (let round = 0; more && round < 4; round++) {
		const url = new URL('https://en.wikipedia.org/w/api.php');
		for (const [k, v] of Object.entries({ ...PARAMS, ggscoord: `${lat}|${lon}`, ...more })) {
			url.searchParams.set(k, v);
		}
		const res = await fetcher(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			// Wikimedia asks API clients to identify themselves.
			headers: { 'user-agent': USER_AGENT }
		});
		if (res.status === 429) throw new RateLimited('Wikipedia answered 429');
		if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
		const text = await res.text();
		let body: { continue?: Record<string, string> };
		try {
			body = JSON.parse(text);
		} catch {
			// The "too many requests" refusal sometimes comes back as plain text with a 200.
			if (/too many requests/i.test(text)) throw new RateLimited('Wikipedia: too many requests');
			throw new Error(`Wikipedia answered: ${text.slice(0, 80)}`);
		}
		bodies.push(body);
		more = body.continue;
	}
	return bodies;
}

/**
 * Notable things to see in and around the destination, from Wikipedia's free geosearch
 * (no key needed). Searching only the centre of an island finds its villages and
 * municipalities, so it also searches rings around it and keeps the most-read sights.
 */
export function getNearbySights(
	latitude: number,
	longitude: number,
	place = '',
	fetcher = fetch
): Promise<Sight[]> {
	const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${place}`;
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
	// One after another, not all at once: a burst of searches gets rate-limited.
	// The outer ring only when the centre and first ring find too little (a city has plenty).
	const bodies: unknown[] = [];
	let failed = 0;
	let refused = false;
	search: for (const ring of searchRings(latitude, longitude)) {
		if (ring.length > 6 && parseSights(bodies, ENOUGH, place).length >= ENOUGH) break;
		for (const p of ring) {
			// A short pause between searches, and one more try after a longer one.
			for (const [attempt, delay] of [timing.pause, timing.retryAfter].entries()) {
				await sleep(delay);
				try {
					bodies.push(...(await geosearch(p.lat, p.lon, fetcher)));
					break;
				} catch (err) {
					if (attempt === 0 && !(err instanceof RateLimited)) continue;
					failed++;
					console.warn(`Sights search near ${place} failed:`, (err as Error).message);
					// Asking again straight away only extends the block: keep what we have.
					if (err instanceof RateLimited) {
						refused = true;
						break search;
					}
					break;
				}
			}
		}
	}
	const stale = entries().get(key);
	if (bodies.length === 0) return stale?.sights ?? [];
	const sights = parseSights(bodies, 16, place, { lat: latitude, lon: longitude });
	// A partial answer is only kept briefly, so a later visit tries the missing searches again.
	await remember(key, { expires: Date.now() + (failed || refused ? RETRY_MS : TTL_MS), sights });
	return sights;
}
