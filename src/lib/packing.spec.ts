import { describe, expect, it } from 'vitest';
import type { DayWeather } from './climate.ts';
import { weatherSuggestions } from './packing.ts';

const day = (maxC: number, minC: number, rainChance: number): DayWeather => ({
	date: '2026-11-05',
	maxC,
	minC,
	rainChance,
	icon: '',
	summary: '',
	typical: false
});

const labels = (w: Parameters<typeof weatherSuggestions>[0]) =>
	weatherSuggestions(w).map((s) => s.label);

describe('weatherSuggestions', () => {
	it('suggests nothing without weather', () => {
		expect(labels(null)).toEqual([]);
		expect(labels({ kind: 'unavailable', title: '' })).toEqual([]);
	});

	it('reacts to rain, cold and heat in daily weather', () => {
		const w = {
			kind: 'days' as const,
			title: '',
			note: null,
			days: [day(18, 8, 60), day(27, 15, 0)]
		};
		expect(labels(w)).toEqual([
			'Umbrella or rain jacket',
			'Warm jacket',
			'Sunscreen',
			'Sunglasses and a hat',
			'Swimwear'
		]);
	});

	it('uses rainy days and lows for month summaries', () => {
		const w = {
			kind: 'months' as const,
			title: '',
			note: '',
			months: [{ month: '2027-01', maxC: 3, minC: -4, rainyDays: 12, daysInMonth: 31 }]
		};
		expect(labels(w)).toEqual(['Umbrella or rain jacket', 'Winter coat, hat and gloves']);
	});
});
