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
