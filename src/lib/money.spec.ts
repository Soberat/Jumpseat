import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, totalsByCurrency } from './money.ts';

describe('parseAmount', () => {
	it('accepts dots and commas', () => {
		expect(parseAmount('12,50', 'EUR')).toBe(1250);
		expect(parseAmount('12.5', 'EUR')).toBe(1250);
		expect(parseAmount(' 1 200 ', 'EUR')).toBe(120000);
	});

	it('respects zero-decimal currencies', () => {
		expect(parseAmount('1500', 'JPY')).toBe(1500);
	});

	it('rejects junk and zero', () => {
		expect(parseAmount('abc', 'EUR')).toBeNull();
		expect(parseAmount('-3', 'EUR')).toBeNull();
		expect(parseAmount('0', 'EUR')).toBeNull();
	});
});

describe('totalsByCurrency', () => {
	it('sums per currency', () => {
		expect(
			totalsByCurrency([
				{ amountMinor: 1000, currency: 'EUR' },
				{ amountMinor: 250, currency: 'USD' },
				{ amountMinor: 550, currency: 'EUR' }
			])
		).toEqual([
			{ currency: 'EUR', minor: 1550 },
			{ currency: 'USD', minor: 250 }
		]);
	});
});

describe('formatMoney', () => {
	it('formats with the currency', () => {
		expect(formatMoney(1250, 'EUR', 'en-GB')).toBe('€12.50');
		expect(formatMoney(1500, 'JPY', 'en-GB')).toMatch(/¥1,500$/);
	});
});
