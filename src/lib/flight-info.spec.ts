import { describe, expect, it } from 'vitest';
import { normaliseFlightNumber, parseFlights, priceLinks } from './flight-info.ts';

const leg = (extra: object) => ({
	number: 'LH 1166',
	airline: { name: 'Lufthansa' },
	aircraft: { model: 'Airbus A320' },
	codeshareStatus: 'IsOperator',
	departure: {
		airport: { iata: 'FRA', municipalityName: 'Frankfurt-am-Main' },
		scheduledTime: { local: '2026-11-05 09:40+01:00', utc: '2026-11-05 08:40Z' },
		terminal: '1'
	},
	arrival: {
		airport: { iata: 'LIS', municipalityName: 'Lisbon' },
		scheduledTime: { local: '2026-11-05 11:50+00:00', utc: '2026-11-05 11:50Z' }
	},
	...extra
});

describe('parseFlights', () => {
	it('reads local times and gate-to-gate length', () => {
		expect(parseFlights([leg({})])).toEqual([
			{
				flightNumber: 'LH1166',
				airline: 'Lufthansa',
				origin: 'FRA',
				destination: 'LIS',
				originName: 'Frankfurt-am-Main',
				destinationName: 'Lisbon',
				departureDate: '2026-11-05',
				departureTime: '09:40',
				arrivalDate: '2026-11-05',
				arrivalTime: '11:50',
				durationMinutes: 190,
				aircraft: 'Airbus A320',
				terminal: '1'
			}
		]);
	});

	it('prefers the operating carrier and drops duplicates and junk', () => {
		const codeshare = leg({ number: 'TP 7001', codeshareStatus: 'IsCodeshared' });
		const older = {
			number: 'LH 1',
			departure: { airport: { iata: 'MUC' }, scheduledTimeLocal: '2026-11-06 06:30+01:00' },
			arrival: { airport: { iata: 'KRK' } }
		};
		const flights = parseFlights([codeshare, leg({}), older, { number: 'x' }]);
		expect(flights.map((f) => [f.flightNumber, f.origin, f.departureTime])).toEqual([
			['LH1166', 'FRA', '09:40'],
			['LH1', 'MUC', '06:30']
		]);
		expect(parseFlights({ message: 'nope' })).toEqual([]);
	});
});

describe('helpers', () => {
	it('normalises flight numbers', () => {
		expect(normaliseFlightNumber('lh 1166')).toBe('LH1166');
		expect(normaliseFlightNumber('W61234')).toBe('W61234');
		expect(normaliseFlightNumber('hello')).toBeNull();
	});

	it('builds fare search links', () => {
		const links = priceLinks('KRK', 'LIS', '2026-11-05');
		expect(links.skyscanner).toContain('/krk/lis/261105/');
		expect(decodeURIComponent(links.google)).toContain('from KRK to LIS on 2026-11-05');
	});
});
