import { describe, expect, it } from 'vitest';
import { describeCost, NO_COST, parseCost, summariseCosts } from './cost.ts';

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

describe('summariseCosts', () => {
	it('splits paid from to-pay and finds the next payment', () => {
		const s = summariseCosts(
			[
				{
					label: 'Flight',
					costMinor: 30000,
					costCurrency: 'PLN',
					paymentStatus: 'paid',
					dueDate: null
				},
				{
					label: 'Hotel',
					costMinor: 45000,
					costCurrency: 'PLN',
					paymentStatus: 'due',
					dueDate: '2026-11-05'
				},
				{
					label: 'Car',
					costMinor: 12000,
					costCurrency: 'EUR',
					paymentStatus: 'due',
					dueDate: '2026-10-20'
				},
				{
					label: 'Old',
					costMinor: 1000,
					costCurrency: 'EUR',
					paymentStatus: 'due',
					dueDate: '2026-09-01'
				},
				{ label: 'Free', ...NO_COST }
			],
			'2026-10-02'
		)!;
		expect(s.paid).toEqual([{ currency: 'PLN', minor: 30000 }]);
		expect(s.due).toEqual([
			{ currency: 'PLN', minor: 45000 },
			{ currency: 'EUR', minor: 13000 }
		]);
		expect(s.next?.label).toBe('Car');
		expect(s.overdue).toBe(1);
	});

	it('is empty when nothing has a cost', () => {
		expect(summariseCosts([{ label: 'x', ...NO_COST }], '2026-10-02')).toBeNull();
	});
});
