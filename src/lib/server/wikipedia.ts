import { parseSights, type Sight } from '#lib/sights.ts';

const TIMEOUT_MS = 5000;
// Sights don't move; refresh weekly so page-view rankings stay roughly current.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; sights: Sight[] }>();

/** Notable places within 10 km, from Wikipedia's free geosearch (no key needed). */
export async function getNearbySights(
	latitude: number,
	longitude: number,
	fetcher = fetch
): Promise<Sight[]> {
	const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.sights;

	const url = new URL('https://en.wikipedia.org/w/api.php');
	for (const [k, v] of Object.entries({
		action: 'query',
		format: 'json',
		formatversion: '2',
		generator: 'geosearch',
		ggscoord: `${latitude}|${longitude}`,
		ggsradius: '10000',
		ggslimit: '50',
		prop: 'coordinates|description|pageimages|pageviews',
		coprop: 'dist',
		codistancefrompoint: `${latitude}|${longitude}`,
		piprop: 'thumbnail',
		pithumbsize: '160',
		pilimit: '50',
		pvipdays: '30'
	})) {
		url.searchParams.set(k, v);
	}

	try {
		const res = await fetcher(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			// Wikimedia asks API clients to identify themselves.
			headers: { 'user-agent': 'Jumpseat/1.0 (self-hosted travel planner)' }
		});
		if (!res.ok) return [];
		const sights = parseSights(await res.json());
		cache.set(key, { expires: Date.now() + TTL_MS, sights });
		return sights;
	} catch {
		return [];
	}
}
