import { describe, expect, it } from 'vitest';
import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { buildGantt } from './gantt.ts';

const flight = (id: string, date: string, time: string | null): Flight => ({
	id,
	tripId: 't',
	flightNumber: 'LH' + id,
	origin: 'KRK',
	destination: 'LIS',
	departureDate: date,
	departureTime: time,
	arrivalDate: null,
	arrivalTime: null,
	durationMinutes: null,
	standby: true,
	createdAt: new Date(0)
});

const item = (id: string, extra: Partial<TimelineItem>): TimelineItem => ({
	id,
	tripId: 't',
	kind: 'other',
	title: id,
	status: 'booked',
	startDate: null,
	startTime: null,
	endDate: null,
	endTime: null,
	location: null,
	mode: null,
	fromPlace: null,
	toPlace: null,
	reference: null,
	url: null,
	notes: null,
	day: null,
	durationMinutes: null,
	createdAt: new Date(0),
	...extra
});

const trip = { startDate: '2026-11-05', endDate: '2026-11-09' };

describe('buildGantt', () => {
	it('returns nothing without any dates', () => {
		expect(buildGantt([], [], { startDate: null, endDate: null })).toBeNull();
	});

	it('spans the trip and places things by day and time', () => {
		const g = buildGantt(
			[flight('1', '2026-11-05', '06:00')],
			[
				item('hotel', {
					kind: 'stay',
					startDate: '2026-11-05',
					startTime: '15:00',
					endDate: '2026-11-09',
					endTime: '11:00'
				}),
				item('dinner', { kind: 'restaurant', startDate: '2026-11-06', startTime: null })
			],
			trip
		)!;
		expect(g.days).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
		expect(g.lanes.map((l) => l.name)).toEqual(['Flights', 'Stays & cars', 'Plans']);
		expect(g.lanes[0].rows[0][0].start).toBeCloseTo(0.25);
		const hotel = g.lanes[1].rows[0][0];
		expect(hotel.start).toBeCloseTo(15 / 24);
		expect(hotel.end).toBeCloseTo(4 + 11 / 24);
		const dinner = g.lanes[2].rows[0][0];
		expect(dinner).toMatchObject({ point: true, approximate: true, target: 'dinner-start' });
		expect(dinner.start).toBeCloseTo(1 + 19.5 / 24);
	});

	it('joins connecting flights into one journey', () => {
		const leg = (id: string, o: string, d: string, date: string, time: string) => ({
			...flight(id, date, time),
			origin: o,
			destination: d
		});
		const g = buildGantt(
			[
				leg('3', 'LIS', 'MUC', '2026-11-09', '17:25'),
				leg('1', 'KRK', 'MUC', '2026-11-05', '06:30'),
				leg('2', 'MUC', 'LIS', '2026-11-05', '09:40'),
				leg('4', 'MUC', 'KRK', '2026-11-09', '22:30')
			],
			[],
			trip
		)!;
		const bars = g.lanes[0].rows.flat();
		expect(bars.map((b) => [b.label, b.sub, b.target])).toEqual([
			['KRK → MUC → LIS', 'LH1 + LH2', 'flight-1'],
			['LIS → MUC → KRK', 'LH3 + LH4', 'flight-3']
		]);
		expect(bars[0].end).toBeCloseTo(9.67 / 24 + 2.5 / 24, 2);
	});

	it('stacks overlapping things into rows', () => {
		const g = buildGantt(
			[],
			[
				item('a', { startDate: '2026-11-06', startTime: '12:00' }),
				item('b', { startDate: '2026-11-06', startTime: '13:00' }),
				item('c', { startDate: '2026-11-07', startTime: '13:00' })
			],
			trip
		)!;
		expect(g.lanes[0].rows.map((r) => r.map((b) => b.label))).toEqual([['a', 'c'], ['b']]);
	});
});
