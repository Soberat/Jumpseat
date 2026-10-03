import { describe, expect, it } from 'vitest';
import { getNearbySights, searchRings, timing } from './wikipedia.ts';

timing.pause = 0;

const SF = { lat: 37.7749, lon: -122.4194 };

const osm = (
	id: number,
	name: string,
	tags: Record<string, string>,
	lat = 37.8,
	lon = -122.45
) => ({
	type: 'way',
	id,
	center: { lat, lon },
	tags: { name, ...tags }
});

const overpassAnswer = {
	elements: [
		osm(
			1,
			'Golden Gate Bridge',
			{ tourism: 'attraction', wikidata: 'Q44440', wikipedia: 'en:Golden Gate Bridge' },
			37.8199,
			-122.4783
		),
		osm(2, 'Alcatraz Island', { tourism: 'attraction', wikidata: 'Q131354' }, 37.827, -122.423),
		osm(3, 'Coit Tower', {
			tourism: 'attraction',
			wikidata: 'Q1103323',
			wikipedia: 'en:Coit Tower'
		}),
		osm(4, 'Ferry Building', {
			tourism: 'attraction',
			wikidata: 'Q1409128',
			wikipedia: 'en:Ferry Building'
		}),
		osm(5, 'Some Parking Garage', {
			man_made: 'tower',
			wikidata: 'Q999',
			wikipedia: 'en:Some Parking Garage'
		}),
		osm(6, 'No Wikidata Gallery', { tourism: 'gallery' }),
		// Enough other places that this counts as a dense destination (no wider look needed).
		...Array.from({ length: 25 }, (_, i) =>
			osm(100 + i, `Filler ${i}`, {
				tourism: 'museum',
				wikidata: `Q${1000 + i}`,
				wikipedia: `en:Filler ${i}`
			})
		)
	]
};

const wikidataAnswer = {
	entities: { Q131354: { sitelinks: { enwiki: { title: 'Alcatraz Island' } } } }
};

const page = (title: string, description: string, views: number) => ({
	title,
	description,
	pageviews: { '2026-09-01': views }
});

const wikipediaAnswer = {
	query: {
		pages: [
			page('Golden Gate Bridge', 'Suspension bridge in California', 90000),
			page('Alcatraz Island', 'Island in San Francisco Bay', 60000),
			page('Coit Tower', 'Tower in San Francisco', 20000),
			page('Ferry Building', 'Terminal and marketplace in San Francisco', 12000),
			page('Some Parking Garage', 'Municipal garage in San Francisco', 80)
		]
	}
};

const json = (body: unknown) => Response.json(body);

describe('getNearbySights', () => {
	it('lists attractions ranked by readers, never the events tied to the place', async () => {
		const seen: string[] = [];
		const fetcher = (async (url: URL | string) => {
			const u = new URL(url);
			seen.push(u.host);
			if (u.host.includes('overpass')) return json(overpassAnswer);
			if (u.host === 'www.wikidata.org') return json(wikidataAnswer);
			return json(wikipediaAnswer);
		}) as typeof fetch;

		const sights = await getNearbySights(SF.lat, SF.lon, 'San Francisco', fetcher);
		expect(sights.map((s) => s.title).slice(0, 4)).toEqual([
			'Golden Gate Bridge',
			'Alcatraz Island',
			'Coit Tower',
			'Ferry Building'
		]);
		expect(sights.map((s) => s.title)).not.toContain('1906 San Francisco earthquake');
		// One OpenStreetMap request, one Wikidata (for Alcatraz), one Wikipedia: no wider look.
		expect(seen.filter((h) => h.includes('overpass'))).toHaveLength(1);
		expect(seen.filter((h) => h === 'www.wikidata.org')).toHaveLength(1);
		expect(seen.filter((h) => h === 'en.wikipedia.org')).toHaveLength(1);
	});

	it('adds the nearby search ring by ring where OpenStreetMap knows little', async () => {
		let geosearches = 0;
		const fetcher = (async (url: URL | string) => {
			const u = new URL(url);
			if (u.host.includes('overpass')) {
				return json({
					elements: [
						osm(1, 'Islet Fort', { historic: 'fort', wikidata: 'Q7', wikipedia: 'en:Islet Fort' })
					]
				});
			}
			if (u.searchParams.get('generator') === 'geosearch') {
				geosearches++;
				// Only the first ring point (the second search) knows it.
				return json({
					query: {
						pages:
							geosearches === 2
								? [
										{
											pageid: 5,
											title: 'Timanfaya National Park',
											description: 'National park in Spain',
											coordinates: [{ lat: 29.0, lon: -13.7 }],
											pageviews: { a: 2000 }
										}
									]
								: []
					}
				});
			}
			return json({
				query: { pages: [page('Islet Fort', 'Fort on an islet', 300)] }
			});
		}) as typeof fetch;
		const sights = await getNearbySights(29.5, -13.2, 'Some island', fetcher);
		expect(sights.map((s) => s.title)).toEqual(['Timanfaya National Park', 'Islet Fort']);
		expect(geosearches).toBe(19);
		expect(searchRings(29.5, -13.2).flat()).toHaveLength(19);
	});

	it('falls back to nearby articles, filtered, when OpenStreetMap is down', async () => {
		const fetcher = (async (url: URL | string) => {
			const u = new URL(url);
			if (u.host.includes('overpass')) return new Response('busy', { status: 504 });
			return json({
				query: {
					pages: [
						{
							pageid: 1,
							title: '1906 San Francisco earthquake',
							description: 'Earthquake in California',
							coordinates: [{ lat: 37.8, lon: -122.4 }],
							pageviews: { a: 90000 }
						},
						{
							pageid: 2,
							title: 'Asiana Airlines Flight 214',
							description: '2013 aircraft accident in California',
							coordinates: [{ lat: 37.6, lon: -122.4 }],
							pageviews: { a: 50000 }
						},
						{
							pageid: 3,
							title: 'Painted Ladies',
							description: 'Row of Victorian houses in San Francisco',
							coordinates: [{ lat: 37.776, lon: -122.433 }],
							pageviews: { a: 9000 }
						}
					]
				}
			});
		}) as typeof fetch;
		const sights = await getNearbySights(37.9, -122.5, 'San Francisco', fetcher);
		expect(sights.map((s) => s.title)).toEqual(['Painted Ladies']);
	});

	it('returns nothing, without throwing, when every source is down', async () => {
		const fetcher = (async () =>
			new Response('too many requests', { status: 429 })) as typeof fetch;
		expect(await getNearbySights(10, 10, 'Nowhere', fetcher)).toEqual([]);
	});
});
