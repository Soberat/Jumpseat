import { describe, expect, it } from 'vitest';
import {
	describeWeatherForPlanner,
	planWeather,
	typicalDays,
	typicalMonths,
	weatherByDate,
	weatherHeadline,
	yearsBefore,
	type DailyRecord
} from './climate';

const today = '2026-10-02';

describe('planWeather', () => {
	it('uses the next 7 days when the trip has no dates', () => {
		const plan = planWeather({ type: 'none' }, today);
		expect(plan.forecast).toEqual(['2026-10-02', '2026-10-08']);
		expect(plan.typical).toBeNull();
	});

	it('forecasts the trip dates when they are close', () => {
		const plan = planWeather({ type: 'exact', start: '2026-10-05', end: '2026-10-09' }, today);
		expect(plan.forecast).toEqual(['2026-10-05', '2026-10-09']);
		expect(plan.typical).toBeNull();
	});

	it('splits a trip that runs past the forecast horizon', () => {
		const plan = planWeather({ type: 'exact', start: '2026-10-14', end: '2026-10-20' }, today);
		expect(plan.forecast).toEqual(['2026-10-14', '2026-10-17']);
		expect(plan.typical).toEqual(['2026-10-18', '2026-10-20']);
	});

	it('uses typical weather for trips further out, capped in length', () => {
		const plan = planWeather({ type: 'exact', start: '2027-04-01', end: '2027-05-30' }, today);
		expect(plan.forecast).toBeNull();
		expect(plan.typical).toEqual(['2027-04-01', '2027-04-21']);
		expect(plan.note).toContain('first 21 days');
	});

	it('summarises months for month and quarter plans', () => {
		const plan = planWeather(
			{ type: 'period', period: '2027-Q2', months: ['2027-04', '2027-05', '2027-06'] },
			today
		);
		expect(plan.months).toEqual(['2027-04', '2027-05', '2027-06']);
	});

	it('uses recorded weather for trips long past', () => {
		const plan = planWeather({ type: 'exact', start: '2026-03-01', end: '2026-03-05' }, today);
		expect(plan.recorded).toEqual(['2026-03-01', '2026-03-05']);
		expect(plan.forecast).toBeNull();
	});
});

describe('yearsBefore', () => {
	it('handles leap days', () => {
		expect(yearsBefore('2028-02-29', 1)).toBe('2027-02-28');
		expect(yearsBefore('2027-04-10', 3)).toBe('2024-04-10');
	});
});

const rec = (date: string, maxC: number, minC: number, precipitationMm: number): DailyRecord => ({
	date,
	maxC,
	minC,
	precipitationMm
});

describe('typicalDays', () => {
	it('averages the same date over past years', () => {
		const history = new Map(
			[
				rec('2026-04-10', 20, 10, 0),
				rec('2025-04-10', 22, 12, 5),
				rec('2024-04-10', 21, 11, 0)
			].map((r) => [r.date, r])
		);
		const [day] = typicalDays(['2027-04-10'], history);
		expect(day).toMatchObject({
			date: '2027-04-10',
			maxC: 21,
			minC: 11,
			rainChance: 33,
			typical: true,
			icon: '🌦️'
		});
	});

	it('skips dates with no history', () => {
		expect(typicalDays(['2027-04-10'], new Map())).toEqual([]);
	});
});

describe('typicalMonths', () => {
	it('averages temperatures and rainy days per year', () => {
		const records = [
			rec('2026-04-01', 20, 10, 2),
			rec('2026-04-02', 22, 12, 0),
			rec('2025-04-01', 18, 8, 3),
			rec('2025-04-02', 20, 10, 4)
		];
		expect(typicalMonths(['2027-04'], records)).toEqual([
			{ month: '2027-04', maxC: 20, minC: 10, rainyDays: 2, daysInMonth: 30 }
		]);
	});
});

describe('weather summaries', () => {
	const day = (date: string, maxC: number, rainChance: number, icon = '☀️') => ({
		date,
		maxC,
		minC: maxC - 6,
		rainChance,
		icon,
		summary: 'Clear',
		typical: false
	});
	const days = {
		kind: 'days' as const,
		title: 'Forecast',
		note: null,
		days: [day('2026-11-28', 23, 10), day('2026-11-29', 21, 70, '🌧️'), day('2026-11-30', 24, 5)]
	};

	it('sums up the trip in one line', () => {
		expect(weatherHeadline(days)).toBe('☀️ 21–24°, rain likely on 1 day');
		expect(
			weatherHeadline({
				kind: 'months',
				title: 'Typical weather',
				note: '',
				months: [{ month: '2026-11', maxC: 24, minC: 17, rainyDays: 3, daysInMonth: 30 }]
			})
		).toBe('🌤️ 24° by day, 17° at night');
		expect(weatherHeadline({ kind: 'unavailable', title: 'x' })).toBeNull();
	});

	it('gives the planner each day and finds days by date', () => {
		const text = describeWeatherForPlanner(days)!;
		expect(text).toContain('- 2026-11-29: Clear, 21°C / 15°C, 70% chance of rain');
		expect(text).toContain('indoor plans on wet ones');
		expect(weatherByDate(days).get('2026-11-30')?.maxC).toBe(24);
		expect(weatherByDate(null).size).toBe(0);
	});
});
