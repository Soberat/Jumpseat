import { describe, expect, it } from 'vitest';
import {
	formatClock,
	formatNumber,
	formatNumericDate,
	formatStamp,
	placeAndWhen
} from './format.ts';

describe('Polish date and time conventions', () => {
	it('uses day.month.year and a 24-hour clock', () => {
		const d = new Date(2026, 10, 5, 17, 25);
		expect(formatNumericDate('2026-11-05')).toBe('05.11.2026');
		expect(formatClock(d)).toBe('17:25');
		expect(formatStamp(d)).toBe('05.11.2026, 17:25');
		expect(formatClock(new Date(Date.UTC(2026, 10, 5, 8, 5)), 'Europe/Warsaw')).toBe('09:05');
	});

	it('groups numbers the Polish way', () => {
		expect(formatNumber(12345).replace(/\s/g, ' ')).toBe('12 345');
	});
});

describe('placeAndWhen', () => {
	it('joins the place with a description of when', () => {
		expect(
			placeAndWhen('Lisbon', {
				startDate: '2026-10-03',
				endDate: '2026-10-07',
				plannedPeriod: null
			})
		).toBe('Lisbon · 3 – 7 Oct 2026');
		expect(placeAndWhen('Oslo', { startDate: null, endDate: null, plannedPeriod: null })).toBe(
			'Oslo · Dates not set'
		);
	});
});
