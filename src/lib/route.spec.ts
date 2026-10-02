import { describe, expect, it } from 'vitest';
import { airportForPlace, placeCode } from './airports.ts';
import { countdown } from './countdown.ts';
import { parseOrigin, readStops, tripRoute } from './trip-route.ts';
import {
	distanceKm,
	dotsInView,
	frame,
	greatCircle,
	landDots,
	project,
	seamFor,
	placeLabels,
	bow,
	splitAtSeam,
	wrapLon
} from './route.ts';

const FRA = { lat: 50.03, lon: 8.57 };
const LIS = { lat: 38.77, lon: -9.13 };

describe('route geometry', () => {
	it('decodes a plausible amount of land', () => {
		const dots = landDots();
		expect(dots.length).toBeGreaterThan(5000);
		// A point in central Spain is land; mid-Atlantic is not.
		const near = (lat: number, lon: number) =>
			dots.some((d) => Math.abs(d.lat - lat) < 1 && Math.abs(d.lon - lon) < 1);
		expect(near(40, -4)).toBe(true);
		expect(near(35, -40)).toBe(false);
	});

	it('measures and draws a great circle', () => {
		expect(distanceKm(FRA, LIS)).toBeGreaterThan(1800);
		expect(distanceKm(FRA, LIS)).toBeLessThan(1950);
		const arc = greatCircle(FRA, LIS, 10);
		expect(arc).toHaveLength(11);
		expect(arc[0].lat).toBeCloseTo(FRA.lat, 3);
		expect(arc[10].lon).toBeCloseTo(LIS.lon, 3);
	});

	it('keeps longitudes continuous over the date line', () => {
		const arc = greatCircle({ lat: 35.55, lon: 139.78 }, { lat: 37.62, lon: -122.38 });
		for (let i = 1; i < arc.length; i++) {
			expect(Math.abs(arc[i].lon - arc[i - 1].lon)).toBeLessThan(20);
		}
	});

	it('frames both ends inside the view', () => {
		const v = frame([FRA, LIS], 1000, 500);
		for (const p of [FRA, LIS]) {
			const [x, y] = project(p, v);
			expect(x).toBeGreaterThan(0);
			expect(x).toBeLessThan(1000);
			expect(y).toBeGreaterThan(0);
			expect(y).toBeLessThan(500);
		}
		expect(dotsInView(v).length).toBeGreaterThan(100);
	});
});

describe('airports', () => {
	it('finds codes from city names', () => {
		expect(airportForPlace('Lisbon')?.code).toBe('LIS');
		expect(airportForPlace('lisbon, Portugal')?.code).toBe('LIS');
		expect(airportForPlace('Malaga')?.code).toBe('AGP');
		expect(placeCode('Sintra')).toBe('SIN');
	});
});

describe('countdown', () => {
	const exact = { startDate: '2026-11-05', endDate: '2026-11-09', plannedPeriod: null };
	it('counts down, then counts days, then lands', () => {
		expect(countdown(exact, '2026-10-02')).toMatchObject({ big: '34', phase: 'upcoming' });
		expect(countdown(exact, '2026-11-04')).toMatchObject({ big: '1', status: 'BOARDING' });
		expect(countdown(exact, '2026-11-06')).toMatchObject({ big: 'DAY 2', caption: 'OF 5' });
		expect(countdown(exact, '2026-11-10').phase).toBe('past');
	});

	it('handles vague dates', () => {
		const p = (plannedPeriod: string | null) => ({ startDate: null, endDate: null, plannedPeriod });
		expect(countdown(p('2027-04'), '2026-10-02').big).toBe('APR 27');
		expect(countdown(p('2027-Q2'), '2026-10-02').big).toBe('Q2 27');
		expect(countdown(p(null), '2026-10-02').phase).toBe('someday');
	});
});

describe('tripRoute', () => {
	const lisbon = { destination: 'Lisbon', latitude: 38.72, longitude: -9.13, origin: null };
	it('starts from Krakow unless the trip says otherwise', () => {
		expect(tripRoute(lisbon, [])!.home.code).toBe('KRK');
		expect(tripRoute({ ...lisbon, origin: 'WAW' }, [])!.home.code).toBe('WAW');
	});

	it('draws a planned arc from home before any flights', () => {
		const r = tripRoute(lisbon, [])!;
		expect(r.home.code).toBe('KRK');
		expect(r.destination.code).toBe('LIS');
		expect(r.legs).toHaveLength(1);
		expect(r.legs[0].planned).toBe(true);
	});

	it('uses real legs and names the landing airport', () => {
		const r = tripRoute(
			{ destination: 'Sintra', latitude: 38.8, longitude: -9.38, origin: 'FRA' },
			[
				{ origin: 'FRA', destination: 'LIS', standby: true, flightNumber: 'LH1166' },
				{ origin: 'LIS', destination: 'FRA', standby: true, flightNumber: 'LH1167' },
				{ origin: 'XXX', destination: 'LIS', standby: false, flightNumber: 'ZZ1' }
			]
		)!;
		expect(r.legs).toHaveLength(2);
		expect(r.destination).toMatchObject({ code: 'LIS', label: 'Sintra' });
	});

	it('reads a starting point from a code or a city', () => {
		expect(parseOrigin('')).toEqual({ origin: null });
		expect(parseOrigin('KRK · Krakow')).toEqual({ origin: null });
		expect(parseOrigin('waw')).toEqual({ origin: 'WAW' });
		expect(parseOrigin('Vienna')).toEqual({ origin: 'VIE' });
		expect(parseOrigin('Atlantis')).toHaveProperty('error');
	});

	describe('multi-stop trips', () => {
		const world = {
			destination: 'San Francisco',
			latitude: 37.77,
			longitude: -122.42,
			origin: null,
			stops: JSON.stringify([
				{ name: 'Sydney', lat: -33.87, lon: 151.21 },
				{ name: 'Singapore', lat: null, lon: null },
				{ name: 'Atlantis', lat: null, lon: null }
			])
		};

		it('plans every hop and the way home', () => {
			const r = tripRoute(world, [])!;
			expect(r.stops.map((s) => s.code)).toEqual(['SYD', 'SIN']);
			expect(r.legs.map((l) => `${l.from.code}-${l.to.code}`)).toEqual([
				'KRK-SFO',
				'SFO-SYD',
				'SYD-SIN',
				'SIN-KRK'
			]);
			expect(r.legs.every((l) => l.planned)).toBe(true);
			expect(r.distanceKm).toBeGreaterThan(35000);
		});

		it('counts hops flown through a connection', () => {
			const r = tripRoute(world, [
				{ origin: 'KRK', destination: 'FRA', standby: true, flightNumber: 'LH1365' },
				{ origin: 'FRA', destination: 'SFO', standby: true, flightNumber: 'LH454' }
			])!;
			expect(r.legs.map((l) => `${l.from.code}-${l.to.code}${l.planned ? '?' : ''}`)).toEqual([
				'KRK-FRA',
				'FRA-SFO',
				'SFO-SYD?',
				'SYD-SIN?',
				'SIN-KRK?'
			]);
		});

		it('ignores broken stop data', () => {
			expect(readStops('not json')).toEqual([]);
			expect(readStops('[{"name":""},{"name":"Oslo","lat":null,"lon":null}]')).toHaveLength(1);
		});
	});

	it('gives up without any coordinates', () => {
		expect(
			tripRoute({ destination: 'Nowhere', latitude: null, longitude: null, origin: null }, [])
		).toBeNull();
	});
});

describe('seamFor', () => {
	it('leaves ordinary routes in ordinary longitudes', () => {
		const seam = seamFor([
			{ lat: 50.08, lon: 19.78 },
			{ lat: 38.77, lon: -9.13 }
		]);
		expect(wrapLon(19.78, seam)).toBeCloseTo(19.78);
		expect(wrapLon(-9.13, seam)).toBeCloseTo(-9.13);
	});

	it('cuts a round-the-world trip over the Atlantic so the Pacific stays whole', () => {
		const krk = { lat: 50, lon: 19.8 };
		const sfo = { lat: 37.6, lon: -122.4 };
		const syd = { lat: -33.9, lon: 151.2 };
		const seam = seamFor([krk, sfo, syd, { lat: 1.4, lon: 104 }]);
		expect(seam).toBeGreaterThan(-122.4);
		expect(seam).toBeLessThan(19.8);
		// SFO → SYD is one piece; KRK → SFO crosses the cut.
		expect(splitAtSeam(greatCircle(sfo, syd), seam)).toHaveLength(1);
		expect(splitAtSeam(greatCircle(krk, sfo), seam)).toHaveLength(2);
	});
});

describe('placeLabels', () => {
	it('moves a label that would overlap its neighbour, and drops connections with no room', () => {
		const [fra, krk, via] = placeLabels(
			[
				{ x: 100, y: 50, text: 'FRA', size: 12, r: 4 },
				{ x: 118, y: 50, text: 'KRK', size: 12, r: 4 },
				{ x: 109, y: 50, text: 'MUC', size: 12, r: 3, optional: true }
			],
			400,
			200
		);
		expect(fra).toMatchObject({ x: 100, anchor: 'middle' });
		expect(krk).not.toBeNull();
		expect([krk!.anchor, krk!.y < 50]).not.toEqual(['middle', false]);
		expect(via).toBeNull();
	});
});

describe('bow', () => {
	it('bends outbound and return legs to opposite sides', () => {
		const line: [number, number][] = [
			[0, 0],
			[50, 0],
			[100, 0]
		];
		const back = line.toReversed();
		expect(bow(line)[1][1]).toBeLessThan(0);
		expect(bow(back)[1][1]).toBeGreaterThan(0);
	});
});
