import { describe, expect, it } from 'vitest';
import { distanceKm } from '#lib/route.ts';
import { getNearbySights, searchRings, timing } from './wikipedia.ts';

timing.pause = 0;
timing.retryAfter = 0;

const page = (pageid: number, title: string, views?: number) => ({
	pageid,
	title,
	description: 'Lava cave',
	coordinates: [{ lat: 29.1, lon: -13.5 }],
	...(views === undefined ? {} : { pageviews: { '2026-09-01': views } })
});

describe('getNearbySights', () => {
	it('reaches the far corners of an island like Lanzarote', () => {
		const points = searchRings(29.01, -13.641).flat();
		expect(points).toHaveLength(19);
		const far = [
			{ lat: 29.157, lon: -13.432 }, // Jameos del Agua
			{ lat: 29.214, lon: -13.481 }, // Mirador del Río
			{ lat: 28.85, lon: -13.79 } // Papagayo beaches
		];
		for (const sight of far) {
			expect(Math.min(...points.map((p) => distanceKm(p, sight)))).toBeLessThanOrEqual(10);
		}
	});

	it('follows continuations for page views and survives a rate-limit answer', async () => {
		let calls = 0;
		const fetcher = (async (url: URL) => {
			calls++;
			if (calls === 3) return new Response('You are making too many requests to the API.');
			if (url.searchParams.get('pvipcontinue')) {
				return Response.json({ query: { pages: [page(2, 'Cueva de los Verdes', 900)] } });
			}
			return Response.json({
				continue: { pvipcontinue: 'Cueva', continue: '||' },
				query: {
					pages: [page(1, 'Jameos del Agua', 500), page(2, 'Cueva de los Verdes')]
				}
			});
		}) as typeof fetch;
		const sights = await getNearbySights(29.2, -13.45, 'Test island', fetcher);
		expect(sights.map((s) => [s.title, s.popularity])).toEqual([
			['Cueva de los Verdes', 900],
			['Jameos del Agua', 500]
		]);
	});
});
