import { describe, expect, it } from 'vitest';
import {
	mergePlans,
	parsePlan,
	planLength,
	planParts,
	planToTimeline,
	type TripPlan
} from './plan.ts';

const plan: TripPlan = {
	summary: '',
	whereToStay: { area: 'Baixa', why: '', priceRange: '' },
	days: [
		{
			day: 1,
			theme: 'Arrival',
			items: [
				{
					time: '19:30',
					durationMinutes: 90,
					kind: 'restaurant',
					title: 'Taberna da Rua das Flores',
					location: 'Chiado',
					details: 'Small, no bookings.',
					estimatedCost: 70
				},
				{
					time: null,
					durationMinutes: null,
					kind: 'stay',
					title: 'Baixa hotel',
					location: null,
					details: '',
					estimatedCost: null
				}
			]
		},
		{
			day: 2,
			theme: 'Belém',
			items: [
				{
					time: '9am',
					durationMinutes: 0,
					kind: 'activity',
					title: 'Jerónimos Monastery',
					location: 'Belém',
					details: 'Go early.',
					estimatedCost: 0
				}
			]
		}
	],
	budget: { lines: [], total: 0 },
	tips: [],
	packing: []
};

describe('planLength', () => {
	it('uses the trip dates when set', () => {
		expect(planLength({ type: 'exact', start: '2026-11-05', end: '2026-11-09' }, 3)).toBe(5);
	});

	it('uses the requested length otherwise, within limits', () => {
		expect(planLength({ type: 'none' }, 4)).toBe(4);
		expect(planLength({ type: 'none' }, 0)).toBe(1);
		expect(planLength({ type: 'period', period: '2027-04', months: ['2027-04'] }, 40)).toBe(40);
		expect(planLength({ type: 'none' }, 90)).toBe(60);
		expect(planLength({ type: 'exact', start: '2026-11-01', end: '2026-11-21' }, 3)).toBe(21);
	});
});

describe('planToTimeline', () => {
	it('dates items from the trip start and skips stay suggestions', () => {
		const rows = planToTimeline(plan, '2026-11-05', 'EUR');
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			kind: 'restaurant',
			title: 'Taberna da Rua das Flores',
			status: 'idea',
			startDate: '2026-11-05',
			startTime: '19:30',
			durationMinutes: 90,
			notes: 'Small, no bookings. About 70 EUR.'
		});
		// Malformed time is dropped rather than stored.
		expect(rows[1]).toMatchObject({
			kind: 'other',
			startDate: '2026-11-06',
			startTime: null,
			durationMinutes: null
		});
	});

	it('keeps the day and time when the trip has no dates', () => {
		const rows = planToTimeline(plan, null, 'EUR');
		expect(rows.map((r) => [r.title, r.day, r.startDate, r.startTime])).toEqual([
			['Taberna da Rua das Flores', 1, null, '19:30'],
			['Jerónimos Monastery', 2, null, null]
		]);
	});
});

describe('parsePlan', () => {
	it('maps unexpected kinds and categories to safe values', () => {
		const raw = JSON.parse(JSON.stringify(plan));
		raw.days[0].items[0].kind = 'Restaurant';
		raw.days[1].items[0].kind = 'sightseeing';
		raw.budget.lines = [{ category: 'Accommodation', amount: 500, note: '' }];
		const parsed = parsePlan(raw);
		expect(parsed.days[0].items[0].kind).toBe('restaurant');
		expect(parsed.days[1].items[0].kind).toBe('activity');
		expect(parsed.budget.lines[0].category).toBe('other');
	});

	it('accepts plans saved before durations existed', () => {
		const raw = JSON.parse(JSON.stringify(plan));
		delete raw.days[0].items[0].durationMinutes;
		expect(parsePlan(raw).days[0].items[0].durationMinutes).toBeNull();
	});

	it('still rejects a plan missing required parts', () => {
		expect(() => parsePlan({ summary: 'x' })).toThrow();
	});
});

describe('planParts', () => {
	it('keeps two weeks or less in one go', () => {
		expect(planParts(5)).toEqual([[1, 5]]);
		expect(planParts(14)).toEqual([[1, 14]]);
	});

	it('splits longer trips into even parts that cover every day', () => {
		expect(planParts(21)).toEqual([
			[1, 7],
			[8, 14],
			[15, 21]
		]);
		for (const days of [15, 23, 30, 47, 60]) {
			const parts = planParts(days);
			expect(parts[0][0]).toBe(1);
			expect(parts.at(-1)![1]).toBe(days);
			parts.forEach(([a, b], i) => {
				expect(b - a + 1).toBeLessThanOrEqual(10);
				if (i > 0) expect(a).toBe(parts[i - 1][1] + 1);
			});
		}
	});
});

describe('mergePlans', () => {
	const part = (days: number[], total: number, tips: string[]): TripPlan => ({
		summary: `Part from day ${days[0]}`,
		whereToStay: { area: `Area ${days[0]}`, why: '', priceRange: '' },
		days: days.map((day) => ({ day, theme: `Day ${day}`, items: [] })),
		budget: {
			lines: [
				{ category: 'food', amount: total / 2, note: 'Meals' },
				{ category: 'activities', amount: total / 2, note: 'Tickets' }
			],
			total
		},
		tips,
		packing: ['Sunscreen']
	});

	it('joins days in order and adds up the budget', () => {
		const plan = mergePlans([
			part([1, 2], 200, ['Buy a pass']),
			part([3, 4], 100, ['buy a pass', 'Book ahead'])
		]);
		expect(plan.summary).toBe('Part from day 1');
		expect(plan.whereToStay.area).toBe('Area 1');
		expect(plan.days.map((d) => d.day)).toEqual([1, 2, 3, 4]);
		expect(plan.budget.total).toBe(300);
		expect(plan.budget.lines.find((l) => l.category === 'food')?.amount).toBe(150);
		expect(plan.tips).toHaveLength(2);
		expect(plan.packing).toEqual(['Sunscreen']);
	});
});
