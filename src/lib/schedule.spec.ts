import { describe, expect, it } from 'vitest';
import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { placeByDay, scheduleTrip, UNDATED_START } from './schedule.ts';

const item = (id: string, extra: Partial<TimelineItem>): TimelineItem => ({
	id,
	tripId: 't',
	kind: 'other',
	title: id,
	status: 'idea',
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
	costMinor: null,
	costCurrency: null,
	paymentStatus: null,
	dueDate: null,
	createdAt: new Date(0),
	...extra
});

const flight = { departureDate: '2026-11-04' } as Flight;

describe('scheduleTrip', () => {
	it('counts plan days from the trip start, keeping real dates', () => {
		const s = scheduleTrip(
			{ startDate: '2026-11-05' },
			[],
			[item('a', { day: 3 }), item('b', { day: 2, startDate: '2026-11-20' }), item('c', {})]
		);
		expect(s).toMatchObject({ start: '2026-11-05', undated: false });
		expect(s.items.map((i) => i.startDate)).toEqual(['2026-11-07', '2026-11-20', null]);
	});

	it('uses the earliest booked date when the trip has only a month', () => {
		const s = scheduleTrip({ startDate: null }, [flight], [item('a', { day: 2 })]);
		expect(s).toMatchObject({ start: '2026-11-04', undated: false });
		expect(s.items[0].startDate).toBe('2026-11-05');
	});

	it('falls back to numbered days when nothing has a date', () => {
		const s = scheduleTrip({ startDate: null }, [], [item('a', { day: 4 }), item('b', {})]);
		expect(s).toMatchObject({ start: UNDATED_START, undated: true });
		expect(s.items.map((i) => i.startDate)).toEqual(['2000-01-06', null]);
	});

	it('leaves a trip with nothing to place alone', () => {
		expect(scheduleTrip({ startDate: null }, [], [item('a', {})])).toMatchObject({
			start: null,
			undated: false
		});
	});
});

describe('placeByDay', () => {
	it('does nothing without a start', () => {
		const items = [item('a', { day: 1 })];
		expect(placeByDay(items, null)).toBe(items);
	});
});
