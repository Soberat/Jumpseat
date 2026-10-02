import { describe, expect, it } from 'vitest';
import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { buildTimeline, itemIcon, transportTitle } from './timeline';

const created = new Date('2026-10-01T00:00:00Z');

function item(over: Partial<TimelineItem>): TimelineItem {
	return {
		id: 'i',
		tripId: 't',
		kind: 'other',
		title: 'Thing',
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
		createdAt: created,
		...over
	};
}

function flight(over: Partial<Flight>): Flight {
	return {
		id: 'f',
		tripId: 't',
		flightNumber: 'LH1166',
		origin: 'FRA',
		destination: 'LIS',
		departureDate: '2026-10-03',
		departureTime: '09:40',
		standby: true,
		createdAt: created,
		...over
	};
}

const keys = (days: ReturnType<typeof buildTimeline>['days']) =>
	days.map((d) => [d.date, d.entries.map((e) => e.key)]);

describe('buildTimeline', () => {
	it('splits stays into check-in and check-out and orders by day and time', () => {
		const { days, unscheduled } = buildTimeline(
			[
				flight({ id: 'out' }),
				flight({ id: 'back', departureDate: '2026-10-07', departureTime: '18:25' })
			],
			[
				item({
					id: 'hotel',
					kind: 'stay',
					startDate: '2026-10-03',
					startTime: '15:00',
					endDate: '2026-10-07',
					endTime: '11:00'
				}),
				item({
					id: 'taxi',
					kind: 'transport',
					mode: 'taxi',
					startDate: '2026-10-03',
					startTime: '12:30'
				}),
				item({ id: 'idea', kind: 'restaurant', status: 'idea' })
			]
		);

		expect(keys(days)).toEqual([
			['2026-10-03', ['flight-out', 'taxi-start', 'hotel-start']],
			['2026-10-07', ['hotel-end', 'flight-back']]
		]);
		const checkOut = days[1].entries[0];
		expect(checkOut.type === 'item' && checkOut.phaseLabel).toBe('Check-out');
		expect(unscheduled.map((u) => u.id)).toEqual(['idea']);
	});

	it('puts a check-out before the next check-in on the same day when times are missing', () => {
		const { days } = buildTimeline(
			[],
			[
				item({ id: 'b', kind: 'stay', startDate: '2026-10-05', endDate: '2026-10-07' }),
				item({ id: 'a', kind: 'stay', startDate: '2026-10-03', endDate: '2026-10-05' })
			]
		);
		expect(keys(days)).toEqual([
			['2026-10-03', ['a-start']],
			['2026-10-05', ['a-end', 'b-start']],
			['2026-10-07', ['b-end']]
		]);
	});

	it('shows a same-day car rental once', () => {
		const { days } = buildTimeline(
			[],
			[item({ id: 'car', kind: 'car', startDate: '2026-10-04', endDate: '2026-10-04' })]
		);
		expect(keys(days)).toEqual([['2026-10-04', ['car-start']]]);
	});
});

describe('labels', () => {
	it('builds transport titles and icons', () => {
		expect(transportTitle('train', 'Lisbon', 'Sintra')).toBe('Train · Lisbon → Sintra');
		expect(transportTitle(null, null, null)).toBe('Transport');
		expect(itemIcon({ kind: 'transport', mode: 'ferry' })).toBe('⛴️');
		expect(itemIcon({ kind: 'stay', mode: null })).toBe('🏨');
	});
});
