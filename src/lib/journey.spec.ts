import { describe, expect, it } from 'vitest';
import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import {
	cardsByDay,
	dayRange,
	journeyDays,
	layoutDay,
	stayFor,
	timeAt,
	trayItems,
	type JourneyCard
} from './journey.ts';

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
	createdAt: new Date(0),
	...extra
});

const flight = {
	id: 'f',
	origin: 'KRK',
	destination: 'MUC',
	departureDate: '2026-11-05',
	departureTime: '09:40'
} as Flight;

describe('timeAt', () => {
	const range = { start: 8 * 60, end: 22 * 60 };
	it('maps the column to the drawn range in five-minute steps', () => {
		expect(timeAt(0, range)).toBe('08:00');
		expect(timeAt(0.5, range)).toBe('15:00');
		expect(timeAt(0.503, range)).toBe('15:05');
		expect(timeAt(0.5, range, 15)).toBe('15:00');
		expect(timeAt(1, range)).toBe('21:55');
		expect(timeAt(-3, range)).toBe('08:00');
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

const card = (key: string, time: string | null, minutes: number): JourneyCard => ({
	key,
	type: 'item',
	phase: null,
	time,
	movable: true,
	minutes,
	estimated: false
});

describe('layoutDay', () => {
	it('measures free time between things and splits clashes into lanes', () => {
		const { placed, gaps } = layoutDay([
			card('breakfast', '08:00', 45),
			card('museum', '09:30', 120),
			card('call', '10:00', 30),
			card('lunch', '13:00', 60),
			card('anytime', null, 60)
		]);
		expect(placed.map((p) => [p.card.key, p.lane, p.lanes, p.overlaps])).toEqual([
			['breakfast', 0, 1, false],
			['museum', 0, 2, true],
			['call', 1, 2, true],
			['lunch', 0, 1, false]
		]);
		expect(gaps.map((g) => g.minutes)).toEqual([45, 90]);
	});

	it('counts back-to-back things as no gap', () => {
		expect(layoutDay([card('a', '10:00', 60), card('b', '11:00', 30)]).gaps).toEqual([]);
	});
});

describe('dayRange', () => {
	it('widens to whole hours around early and late plans', () => {
		const byDay = new Map([['d', [card('a', '06:40', 30), card('b', '22:10', 90)]]]);
		expect(dayRange(byDay)).toEqual({ start: 6 * 60, end: 24 * 60 });
		expect(dayRange(new Map())).toEqual({ start: 480, end: 1320 });
	});
});
