import { describe, expect, it } from 'vitest';
import { airportForPlace, placeCode } from './airports.ts';
import { countdown } from './countdown.ts';
import { parseOrigin, tripRoute } from './trip-route.ts';
import { distanceKm, dotsInView, frame, greatCircle, landDots, project } from './route.ts';

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

	it('gives up without any coordinates', () => {
		expect(
			tripRoute({ destination: 'Nowhere', latitude: null, longitude: null, origin: null }, [])
		).toBeNull();
	});
});
