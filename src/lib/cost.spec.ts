import { describe, expect, it } from 'vitest';
import { costOf, describeCost, NO_COST, parseCost } from './cost.ts';

const form = (fields: Record<string, string>) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	return data;
};

describe('parseCost', () => {
	it('treats an empty amount as no cost', () => {
		expect(parseCost(form({ costAmount: '', paymentStatus: 'due' }))).toEqual(NO_COST);
	});

	it('reads a paid cost with a decimal comma', () => {
		expect(parseCost(form({ costAmount: '1 250,50', costCurrency: 'pln' }))).toEqual({
			costMinor: 125050,
			costCurrency: 'PLN',
			paymentStatus: 'paid',
			dueDate: null
		});
	});

	it('keeps a due date only for costs still to pay', () => {
		expect(
			parseCost(
				form({ costAmount: '89', costCurrency: 'EUR', paymentStatus: 'due', dueDate: '2026-11-05' })
			)
		).toMatchObject({ paymentStatus: 'due', dueDate: '2026-11-05' });
		expect(
			parseCost(form({ costAmount: '89', paymentStatus: 'paid', dueDate: '2026-11-05' }))
		).toMatchObject({ costCurrency: 'PLN', dueDate: null });
	});

	it('rejects nonsense', () => {
		expect(parseCost(form({ costAmount: 'lots' }))).toHaveProperty('error');
		expect(parseCost(form({ costAmount: '10', costCurrency: 'zloty' }))).toHaveProperty('error');
	});
});

describe('describeCost', () => {
	const cost = { costMinor: 45000, costCurrency: 'PLN', dueDate: null };
	it('says paid, to pay, or overdue', () => {
		expect(describeCost({ ...cost, paymentStatus: 'paid' }, '2026-10-02')).toMatchObject({
			status: 'Paid',
			tone: 'paid'
		});
		expect(
			describeCost({ ...cost, paymentStatus: 'due', dueDate: '2026-11-05' }, '2026-10-02')
		).toMatchObject({ status: 'To pay by 05.11.2026', tone: 'due' });
		expect(
			describeCost({ ...cost, paymentStatus: 'due', dueDate: '2026-09-30' }, '2026-10-02')
		).toMatchObject({ status: 'Was due 30.09.2026', tone: 'overdue' });
		expect(describeCost({ ...NO_COST }, '2026-10-02')).toBeNull();
	});
});

describe('costOf', () => {
	it('reads a linked expense as a cost, or none', () => {
		expect(
			costOf({ amountMinor: 500, currency: 'EUR', paymentStatus: 'due', dueDate: '2026-11-01' })
		).toEqual({ costMinor: 500, costCurrency: 'EUR', paymentStatus: 'due', dueDate: '2026-11-01' });
		expect(costOf(undefined)).toEqual(NO_COST);
	});
});
