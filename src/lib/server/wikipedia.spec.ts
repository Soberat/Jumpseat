import { describe, expect, it } from 'vitest';
import { getNearbySights, searchPoints } from './wikipedia.ts';

const page = (pageid: number, title: string, views?: number) => ({
	pageid,
	title,
	description: 'Lava cave',
	coordinates: [{ lat: 29.1, lon: -13.5 }],
	...(views === undefined ? {} : { pageviews: { '2026-09-01': views } })
});

describe('getNearbySights', () => {
	it('searches a ring around the centre', () => {
		const points = searchPoints(29, -13.6);
		expect(points).toHaveLength(7);
		expect(points[1].lat).toBeCloseTo(29, 5);
		expect(points[1].lon).toBeGreaterThan(-13.6);
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
