import { describe, expect, it } from 'vitest';
import { describeWhen, parseWhen, periodMonths, upcomingQuarters, whenSortKey } from './when';

const when = (startDate: string | null, endDate: string | null, plannedPeriod: string | null) => ({
	startDate,
	endDate,
	plannedPeriod
});

function form(fields: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	return data;
}

describe('periodMonths', () => {
	it('expands months and quarters', () => {
		expect(periodMonths('2027-04')).toEqual(['2027-04']);
		expect(periodMonths('2027-Q4')).toEqual(['2027-10', '2027-11', '2027-12']);
		expect(periodMonths('2027-Q5')).toBeNull();
		expect(periodMonths('2027-13')).toBeNull();
	});
});

describe('describeWhen', () => {
	it('describes exact, vague and missing dates', () => {
		expect(describeWhen(when('2026-10-03', '2026-10-07', null))).toBe('3 – 7 Oct 2026');
		expect(describeWhen(when('2026-10-30', '2026-11-02', null))).toBe('30 Oct – 2 Nov 2026');
		expect(describeWhen(when('2026-12-30', '2027-01-02', null))).toBe('30 Dec 2026 – 2 Jan 2027');
		expect(describeWhen(when('2026-10-03', '2026-10-03', null))).toBe('3 Oct 2026');
		expect(describeWhen(when(null, null, '2027-04'))).toBe('April 2027');
		expect(describeWhen(when(null, null, '2027-Q2'))).toBe('Q2 2027 (Apr – Jun)');
		expect(describeWhen(when(null, null, null))).toBe('Dates not set');
	});
});

describe('whenSortKey', () => {
	it('orders exact dates and periods together, undecided last', () => {
		const trips = [
			when(null, null, null),
			when(null, null, '2027-Q2'),
			when('2027-04-10', '2027-04-12', null),
			when(null, null, '2026-11')
		];
		const sorted = [...trips].sort((a, b) => whenSortKey(a).localeCompare(whenSortKey(b)));
		expect(sorted.map(describeWhen)).toEqual([
			'November 2026',
			'Q2 2027 (Apr – Jun)',
			'10 – 12 Apr 2027',
			'Dates not set'
		]);
	});
});

describe('parseWhen', () => {
	it('reads each mode', () => {
		expect(
			parseWhen(form({ when: 'exact', startDate: '2026-10-03', endDate: '2026-10-07' }))
		).toEqual(when('2026-10-03', '2026-10-07', null));
		expect(parseWhen(form({ when: 'exact', startDate: '2026-10-03' }))).toEqual(
			when('2026-10-03', '2026-10-03', null)
		);
		expect(parseWhen(form({ when: 'month', month: '2027-04' }))).toEqual(
			when(null, null, '2027-04')
		);
		expect(parseWhen(form({ when: 'quarter', quarter: '2027-Q2' }))).toEqual(
			when(null, null, '2027-Q2')
		);
		expect(parseWhen(form({ when: 'none' }))).toEqual(when(null, null, null));
	});

	it('rejects bad input', () => {
		expect(
			parseWhen(form({ when: 'exact', startDate: '2026-10-07', endDate: '2026-10-03' }))
		).toHaveProperty('error');
		expect(parseWhen(form({ when: 'exact' }))).toHaveProperty('error');
		expect(parseWhen(form({ when: 'month', month: 'soon' }))).toHaveProperty('error');
	});
});

describe('upcomingQuarters', () => {
	it('starts at the current quarter and rolls over the year', () => {
		expect(upcomingQuarters('2026-10-02', 3)).toEqual(['2026-Q4', '2027-Q1', '2027-Q2']);
	});
});
