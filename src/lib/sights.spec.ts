import { describe, expect, it } from 'vitest';
import { overpassPartial, overpassQuery, parseOverpass, parseSights, shortlist } from './sights.ts';

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

describe('parseSights around an island', () => {
	it('drops the island itself, its towns and undescribed pages, and merges searches', () => {
		const centre = { lat: 29.01, lon: -13.641 };
		const at = (
			title: string,
			description: string | undefined,
			views: number,
			lat = 29.0,
			lon = -13.7
		) => ({
			pageid: views,
			title,
			description,
			coordinates: [{ lat, lon }],
			pageviews: { '2026-09-01': views }
		});
		const middle = {
			query: {
				pages: [
					at('Lanzarote', 'Canary Island', 20250),
					at('Teguise (village)', 'Town in Canary Islands, Spain', 1315),
					at('Tías, Las Palmas', 'Municipality in Canary Islands, Spain', 321),
					at('La Vegueta', 'Human settlement in the Canary Islands, Spain', 21),
					at('Ciudad Deportiva de Lanzarote', undefined, 301),
					at('Lanzarote (Senate constituency)', 'Senate constituency in Spain', 34)
				]
			}
		};
		const north = {
			query: {
				pages: [
					at('Jameos del Agua', 'Volcanic cave and art centre', 4000, 29.157, -13.432),
					at('Teguise (village)', 'Town in Canary Islands, Spain', 1315)
				]
			}
		};
		const west = {
			query: { pages: [at('Timanfaya National Park', 'National park in Spain', 9000)] }
		};
		const sights = parseSights([middle, north, west], 12, 'Lanzarote', centre);
		expect(sights.map((s) => s.title)).toEqual(['Timanfaya National Park', 'Jameos del Agua']);
		expect(sights[1].distanceKm).toBeGreaterThan(20);
	});
});

describe('parseOverpass', () => {
	const el = (id: number, tags: Record<string, string>) => ({
		type: 'node',
		id,
		lat: 1,
		lon: 2,
		tags
	});

	it('keeps named places with a Wikidata id, one per id, preferring the better kind', () => {
		const found = parseOverpass({
			elements: [
				el(1, { name: 'Park gate', historic: 'city_gate', wikidata: 'Q1' }),
				el(2, { name: 'Big Park', leisure: 'park', wikidata: 'Q1' }),
				el(3, { name: 'Castle', historic: 'castle', wikidata: 'Q2', wikipedia: 'en:Castle' }),
				el(4, { name: 'No id', tourism: 'museum' }),
				el(5, { tourism: 'museum', wikidata: 'Q3' }),
				el(6, { name: 'Bad id', tourism: 'museum', wikidata: 'nope' })
			]
		});
		expect(found.map((c) => [c.name, c.wikidata, c.title, c.kind])).toEqual([
			['Big Park', 'Q1', null, 'park'],
			['Castle', 'Q2', 'Castle', 'castle']
		]);
	});

	it('puts the sights worth a trip first when choosing what to look up', () => {
		const c = (name: string, kind: string, title: string | null = null) => ({
			name,
			kind,
			title,
			lat: 0,
			lon: 0,
			wikidata: 'Q1'
		});
		const top = shortlist(
			[c('a', 'artwork'), c('b', 'museum'), c('c', 'church'), c('d', 'castle', 'D')],
			2
		);
		expect(top.map((x) => x.name)).toEqual(['d', 'b']);
	});
});

describe('Overpass helpers', () => {
	it('builds a light query: nodes and ways only, fewer kinds when wide', () => {
		const near = overpassQuery(37.77, -122.42, 15000);
		expect(near).not.toContain('nwr');
		expect(near).toContain('way(around:15000,37.77,-122.42)["name"]["wikidata"]["man_made"');
		const wide = overpassQuery(29, -13.6, 40000, true);
		expect(wide).toContain('"tourism"');
		expect(wide).not.toContain('"man_made"');
	});

	it('notices when Overpass gave up part-way', () => {
		expect(overpassPartial({ remark: 'runtime error: Query timed out in "print" at line 1' })).toBe(
			true
		);
		expect(overpassPartial({ elements: [] })).toBe(false);
	});

	it('drops events, crimes and clubs from nearby articles', () => {
		const geo = (title: string, description: string) => ({
			pageid: title.length,
			title,
			description,
			coordinates: [{ lat: 1, lon: 1 }],
			pageviews: { a: 100 }
		});
		const sights = parseSights({
			query: {
				pages: [
					geo('Assassinations of George Moscone and Harvey Milk', '1978 murders in San Francisco'),
					geo('Caldron (sex club)', 'Gay sex club in San Francisco'),
					geo('Civic Center Plaza', 'Plaza in San Francisco')
				]
			}
		});
		expect(sights.map((s) => s.title)).toEqual(['Civic Center Plaza']);
	});
});
