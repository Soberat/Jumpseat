import { describe, expect, it } from 'vitest';
import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { cardsByDay, journeyDays, stackCards, stayFor, timeAt, trayItems } from './journey.ts';

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
	createdAt: new Date(0),
	...extra
});

const flight = { id: 'f', departureDate: '2026-11-05', departureTime: '09:40' } as Flight;

describe('timeAt', () => {
	it('maps the column to 06:00–midnight in quarter hours', () => {
		expect(timeAt(0)).toBe('06:00');
		expect(timeAt(0.5)).toBe('15:00');
		expect(timeAt(0.51)).toBe('15:15');
		expect(timeAt(1)).toBe('23:45');
		expect(timeAt(-3)).toBe('06:00');
	});
});

describe('journeyDays', () => {
	it('covers the dates and anything booked outside them', () => {
		const days = journeyDays(
			'2026-11-05',
			false,
			'2026-11-07',
			[],
			[item('a', { startDate: '2026-11-08' })]
		);
		expect(days.map((d) => [d.date, d.day])).toEqual([
			['2026-11-05', 1],
			['2026-11-06', 2],
			['2026-11-07', 3],
			['2026-11-08', 4]
		]);
	});

	it('numbers days on undated trips, with a spare one at the end', () => {
		const days = journeyDays('2000-01-03', true, null, [], [item('a', { day: 4 })]);
		expect(days.map((d) => d.key)).toEqual(['day-1', 'day-2', 'day-3', 'day-4', 'day-5']);
		expect(journeyDays(null, false, null, [], [])).toHaveLength(3);
	});
});

describe('cardsByDay and trayItems', () => {
	it('puts flights and items on their days in time order', () => {
		const stay = item('hotel', {
			kind: 'stay',
			startDate: '2026-11-05',
			startTime: '15:00',
			endDate: '2026-11-07',
			endTime: '11:00'
		});
		const lunch = item('lunch', { startDate: '2026-11-05', startTime: '12:30' });
		const idea = item('idea', {});
		const byDay = cardsByDay([flight], [stay, lunch, idea], false);
		expect(byDay.get('2026-11-05')!.map((c) => [c.key, c.movable])).toEqual([
			['flight-f', false],
			['lunch-start', true],
			['hotel-start', false]
		]);
		expect(byDay.get('2026-11-07')!.map((c) => c.phase)).toEqual(['Check-out']);
		expect(trayItems([stay, lunch, idea], false)).toEqual([idea]);
		expect(stayFor('2026-11-06', [stay])).toBe(stay);
		expect(stayFor('2026-11-07', [stay])).toBeNull();
	});

	it('uses day numbers on undated trips', () => {
		const a = item('a', { day: 2, startTime: '10:00' });
		expect(cardsByDay([], [a], true).get('day-2')).toHaveLength(1);
		expect(trayItems([a, item('b', {})], true).map((i) => i.id)).toEqual(['b']);
	});
});

describe('stackCards', () => {
	it('pushes overlapping cards down and keeps them inside the column', () => {
		expect(stackCards([0.1, 0.12, 0.5], 500, 60)).toEqual([50, 110, 250]);
		expect(stackCards([0.95, 0.96], 500, 60)).toEqual([380, 440]);
	});
});
