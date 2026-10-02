import { describe, expect, it } from 'vitest';
import { convert, settle, settleUp, shares, splitIds } from './settle.ts';

const RATES = { EUR: 1, PLN: 4.25, USD: 1.1, JPY: 160 };

describe('convert', () => {
	it('goes through EUR, keeping each currency’s decimals', () => {
		expect(convert(1000, 'EUR', 'PLN', RATES)).toBe(4250);
		expect(convert(4250, 'PLN', 'EUR', RATES)).toBe(1000);
		expect(convert(1100, 'USD', 'PLN', RATES)).toBe(4250);
		expect(convert(1600, 'JPY', 'PLN', RATES)).toBe(4250);
		expect(convert(123, 'PLN', 'PLN', null)).toBe(123);
	});

	it('gives up without a rate', () => {
		expect(convert(100, 'VND', 'PLN', RATES)).toBeNull();
		expect(convert(100, 'EUR', 'PLN', null)).toBeNull();
	});
});

describe('shares', () => {
	it('splits to the cent and adds up', () => {
		expect(shares(1000, 3)).toEqual([334, 333, 333]);
		expect(shares(1000, 4)).toEqual([250, 250, 250, 250]);
	});
});

describe('splitIds', () => {
	it('defaults to everyone and ignores people who left', () => {
		expect(splitIds(null, ['a', 'b'])).toEqual(['a', 'b']);
		expect(splitIds('["b","gone"]', ['a', 'b'])).toEqual(['b']);
	});
});

describe('settle', () => {
	const day = new Date('2026-11-05T10:00:00Z');
	const e = (
		id: string,
		amountMinor: number,
		currency: string,
		paidBy: string | null,
		splitWith: string[] | null = null
	) => ({
		id,
		amountMinor,
		currency,
		paidBy,
		splitWith: splitWith && JSON.stringify(splitWith),
		spentOn: '2026-11-05',
		createdAt: day
	});

	it('works out who owes whom in one currency', () => {
		const s = settle(
			[
				e('dinner', 9000, 'PLN', 'miro'), // 30 each
				e('taxi', 1000, 'EUR', 'ola', ['ola', 'kuba']), // 42,50 PLN, 21,25 each
				e('mine', 5000, 'PLN', null) // not shared
			],
			['miro', 'ola', 'kuba'],
			'PLN',
			() => RATES
		);
		expect(s.converted.taxi).toBe(4250);
		expect(Object.fromEntries(s.balances.map((b) => [b.memberId, b.minor]))).toEqual({
			miro: 6000,
			ola: -3000 + 2125,
			kuba: -3000 - 2125
		});
		expect(s.transfers).toEqual([
			{ from: 'kuba', to: 'miro', minor: 5125 },
			{ from: 'ola', to: 'miro', minor: 875 }
		]);
	});

	it('treats a payback as squaring up', () => {
		const s = settle(
			[e('dinner', 10000, 'PLN', 'miro', ['miro', 'ola']), e('back', 5000, 'PLN', 'ola', ['miro'])],
			['miro', 'ola'],
			'PLN',
			() => RATES
		);
		expect(s.transfers).toEqual([]);
	});

	it('skips shared expenses it cannot convert', () => {
		const s = settle([e('x', 100, 'VND', 'miro')], ['miro', 'ola'], 'PLN', () => RATES);
		expect(s.skipped).toBe(1);
		expect(s.transfers).toEqual([]);
	});
});

describe('settleUp', () => {
	it('needs at most n − 1 payments', () => {
		const t = settleUp([
			{ memberId: 'a', minor: 100 },
			{ memberId: 'b', minor: 50 },
			{ memberId: 'c', minor: -75 },
			{ memberId: 'd', minor: -75 }
		]);
		expect(t.length).toBeLessThanOrEqual(3);
		expect(t.reduce((s, x) => s + x.minor, 0)).toBe(150);
	});
});
