import { parseSights, type Sight } from '#lib/sights.ts';

const TIMEOUT_MS = 5000;
// Sights don't move; refresh weekly so page-view rankings stay roughly current.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const pending = new Map<string, Promise<Sight[]>>();
const cache = new Map<string, { expires: number; sights: Sight[] }>();
/** Geosearch reaches at most 10 km, so a ring of searches this far out covers an island or region. */
const RING_KM = 18;

/** The destination's centre and six points around it. */
export function searchPoints(lat: number, lon: number): { lat: number; lon: number }[] {
	const dLat = RING_KM / 111;
	const dLon = RING_KM / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
	return [
		{ lat, lon },
		...Array.from({ length: 6 }, (_, i) => {
			const a = (i * Math.PI) / 3;
			return { lat: lat + dLat * Math.sin(a), lon: lon + dLon * Math.cos(a) };
		})
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
			headers: { 'user-agent': 'Jumpseat/1.0 (self-hosted travel planner)' }
		});
		if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
		const body = (await res.json()) as { continue?: Record<string, string> };
		bodies.push(body);
		more = body.continue;
	}
	return bodies;
}

/**
 * Notable things to see in and around the destination, from Wikipedia's free geosearch
 * (no key needed). Searching only the centre of an island finds its villages and
 * municipalities, so it also searches a ring around it and keeps the most-read sights.
 */
export function getNearbySights(
	latitude: number,
	longitude: number,
	place = '',
	fetcher = fetch
): Promise<Sight[]> {
	const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${place}`;
	const hit = cache.get(key);
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
	const bodies: unknown[] = [];
	let failed = 0;
	for (const p of searchPoints(latitude, longitude)) {
		try {
			bodies.push(...(await geosearch(p.lat, p.lon, fetcher)));
		} catch {
			failed++;
		}
	}
	if (bodies.length === 0) return [];
	const sights = parseSights(bodies, 16, place, { lat: latitude, lon: longitude });
	// A partial answer is only kept briefly, so the next visit tries the missing searches again.
	cache.set(key, { expires: Date.now() + (failed ? RETRY_MS : TTL_MS), sights });
	return sights;
}
