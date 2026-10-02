import { describe, expect, it } from 'vitest';
import type { Flight, StandbyLoad } from '#lib/server/db/schema.ts';
import { bestOptions, oddsFor } from './standby.ts';

const load = (flightId: string, seats: number, listed: number | null, at: number): StandbyLoad => ({
	id: `${flightId}-${at}`,
	flightId,
	cabin: 'economy',
	seatsAvailable: seats,
	standbyListed: listed,
	note: null,
	recordedAt: new Date(at * 1000)
});

const flight = (id: string, extra: Partial<Flight> = {}): Flight => ({
	id,
	tripId: 't',
	flightNumber: id,
	origin: 'FRA',
	destination: 'LIS',
	departureDate: '2026-11-05',
	departureTime: null,
	arrivalDate: null,
	arrivalTime: null,
	durationMinutes: null,
	standby: true,
	createdAt: new Date(0),
	...extra
});

describe('oddsFor', () => {
	it('returns null without loads', () => {
		expect(oddsFor([])).toBeNull();
	});

	it('uses the most recent load', () => {
		const rated = oddsFor([load('a', 20, 2, 1), load('a', 3, 1, 5), load('a', 9, 0, 2)]);
		expect(rated?.margin).toBe(2);
		expect(rated?.odds).toBe('tight');
	});

	it('rates by seats left after the standby list', () => {
		expect(oddsFor([load('a', 12, 4, 1)])?.odds).toBe('good');
		expect(oddsFor([load('a', 5, null, 1)])?.odds).toBe('good');
		expect(oddsFor([load('a', 4, 4, 1)])?.odds).toBe('unlikely');
		expect(oddsFor([load('a', 2, 6, 1)])).toMatchObject({ odds: 'unlikely', margin: -4 });
	});
});

describe('bestOptions', () => {
	it('picks the roomiest flight per leg', () => {
		const flights = [flight('LH1166'), flight('LH1172'), flight('LH1174')];
		const loads = [load('LH1166', 3, 5, 1), load('LH1172', 10, 2, 1)];
		expect(bestOptions(flights, loads)).toEqual(new Set(['LH1172']));
	});

	it('ignores single-flight legs and booked flights', () => {
		const flights = [
			flight('LH1166'),
			flight('LH1167', { origin: 'LIS', destination: 'FRA' }),
			flight('TP579', { standby: false })
		];
		const loads = [load('LH1166', 10, 0, 1), load('TP579', 50, 0, 1)];
		expect(bestOptions(flights, loads).size).toBe(0);
	});
});
