import { describe, expect, it } from 'vitest';
import { clockOf, flightMinutes, formatDuration, itemMinutes, parseDuration } from './duration.ts';

describe('parseDuration', () => {
	it('reads the ways people write durations', () => {
		expect(parseDuration('90')).toBe(90);
		expect(parseDuration('1h30')).toBe(90);
		expect(parseDuration('1h 30m')).toBe(90);
		expect(parseDuration('1:30')).toBe(90);
		expect(parseDuration('2h')).toBe(120);
		expect(parseDuration('1.5h')).toBe(90);
		expect(parseDuration('45min')).toBe(45);
		expect(parseDuration('')).toBeNull();
		expect(parseDuration('soon')).toBeNull();
		expect(parseDuration('0')).toBeNull();
	});
});

describe('formatting', () => {
	it('formats durations and clock times', () => {
		expect(formatDuration(45)).toBe('45 min');
		expect(formatDuration(60)).toBe('1 h');
		expect(formatDuration(95)).toBe('1 h 35');
		expect(clockOf(25 * 60 + 30)).toBe('01:30');
	});
});

describe('defaults', () => {
	it('estimates flights from distance and items by kind', () => {
		expect(flightMinutes({ origin: 'KRK', destination: 'MUC' })).toBeGreaterThanOrEqual(75);
		expect(flightMinutes({ origin: 'KRK', destination: 'MUC' })).toBeLessThanOrEqual(100);
		expect(flightMinutes({ origin: 'XXX', destination: 'MUC' })).toBe(120);
		expect(itemMinutes({ kind: 'restaurant', durationMinutes: null })).toEqual({
			minutes: 90,
			estimated: true
		});
		expect(itemMinutes({ kind: 'other', durationMinutes: 25 })).toEqual({
			minutes: 25,
			estimated: false
		});
	});
});
