import { describe, expect, it } from 'vitest';
import { parsePlan, planLength, planToTimeline, type TripPlan } from './plan.ts';

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
					kind: 'restaurant',
					title: 'Taberna da Rua das Flores',
					location: 'Chiado',
					details: 'Small, no bookings.',
					estimatedCost: 70
				},
				{
					time: null,
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
		expect(planLength({ type: 'period', period: '2027-04', months: ['2027-04'] }, 40)).toBe(14);
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
			notes: 'Small, no bookings. About 70 EUR.'
		});
		// Malformed time is dropped rather than stored.
		expect(rows[1]).toMatchObject({ kind: 'other', startDate: '2026-11-06', startTime: null });
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

	it('still rejects a plan missing required parts', () => {
		expect(() => parsePlan({ summary: 'x' })).toThrow();
	});
});
