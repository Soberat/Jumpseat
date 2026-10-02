import { parseSights, type Sight } from '#lib/sights.ts';

const TIMEOUT_MS = 5000;
// Sights don't move; refresh weekly so page-view rankings stay roughly current.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
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

async function geosearch(lat: number, lon: number, fetcher: typeof fetch): Promise<unknown> {
	const url = new URL('https://en.wikipedia.org/w/api.php');
	for (const [k, v] of Object.entries({
		action: 'query',
		format: 'json',
		formatversion: '2',
		generator: 'geosearch',
		ggscoord: `${lat}|${lon}`,
		ggsradius: '10000',
		ggslimit: '50',
		prop: 'coordinates|description|pageimages|pageviews',
		// Without this only the first 10 pages get coordinates.
		colimit: 'max',
		piprop: 'thumbnail',
		pithumbsize: '160',
		pilimit: '50',
		pvipdays: '30'
	})) {
		url.searchParams.set(k, v);
	}
	const res = await fetcher(url, {
		signal: AbortSignal.timeout(TIMEOUT_MS),
		// Wikimedia asks API clients to identify themselves.
		headers: { 'user-agent': 'Jumpseat/1.0 (self-hosted travel planner)' }
	});
	if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
	return res.json();
}

/**
 * Notable things to see in and around the destination, from Wikipedia's free geosearch
 * (no key needed). Searching only the centre of an island finds its villages and
 * municipalities, so it also searches a ring around it and keeps the most-read sights.
 */
export async function getNearbySights(
	latitude: number,
	longitude: number,
	place = '',
	fetcher = fetch
): Promise<Sight[]> {
	const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${place}`;
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.sights;

	const results = await Promise.allSettled(
		searchPoints(latitude, longitude).map((p) => geosearch(p.lat, p.lon, fetcher))
	);
	const bodies = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
	if (bodies.length === 0) return [];
	const sights = parseSights(bodies, 16, place, { lat: latitude, lon: longitude });
	cache.set(key, { expires: Date.now() + TTL_MS, sights });
	return sights;
}
