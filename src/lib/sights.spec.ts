import { describe, expect, it } from 'vitest';
import { parseSights } from './sights.ts';

const page = (title: string, description: string, views: number, dist = 1234) => ({
	pageid: views,
	title,
	description,
	coordinates: [{ dist }],
	pageviews: { '2026-09-01': views, '2026-09-02': null }
});

describe('parseSights', () => {
	it('ranks by popularity and drops non-sights', () => {
		const body = {
			query: {
				pages: [
					page('Rossio railway station', 'railway station in Lisbon', 9000),
					page('Belém Tower', 'fortified tower in Lisbon', 50000, 6100),
					page('Rua Augusta', 'street in Lisbon', 8000),
					page('Lisbon Oceanarium', 'public aquarium', 30000)
				]
			}
		};
		const sights = parseSights(body);
		expect(sights.map((s) => s.title)).toEqual(['Belém Tower', 'Lisbon Oceanarium']);
		expect(sights[0]).toMatchObject({
			distanceKm: 6.1,
			popularity: 50000,
			url: 'https://en.wikipedia.org/wiki/Bel%C3%A9m_Tower'
		});
	});

	it('copes with an empty or odd response', () => {
		expect(parseSights({})).toEqual([]);
		expect(parseSights(null)).toEqual([]);
	});
});
