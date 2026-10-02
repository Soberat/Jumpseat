import { describe, expect, it } from 'vitest';
import { monthGrid, nights, pickDate, shiftMonth, upcomingMonths } from './calendar';

describe('monthGrid', () => {
	it('starts weeks on Monday', () => {
		const weeks = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
		expect(weeks[0]).toEqual([
			null,
			null,
			null,
			'2026-10-01',
			'2026-10-02',
			'2026-10-03',
			'2026-10-04'
		]);
		expect(weeks.at(-1)).toEqual([
			'2026-10-26',
			'2026-10-27',
			'2026-10-28',
			'2026-10-29',
			'2026-10-30',
			'2026-10-31',
			null
		]);
	});
});

describe('pickDate', () => {
	it('picks check-in, then check-out, then starts over', () => {
		let r = pickDate({ start: null, end: null }, '2026-10-05');
		expect(r).toEqual({ start: '2026-10-05', end: null });
		r = pickDate(r, '2026-10-09');
		expect(r).toEqual({ start: '2026-10-05', end: '2026-10-09' });
		r = pickDate(r, '2026-10-20');
		expect(r).toEqual({ start: '2026-10-20', end: null });
	});

	it('moves check-in when tapping an earlier day', () => {
		expect(pickDate({ start: '2026-10-05', end: null }, '2026-10-01')).toEqual({
			start: '2026-10-01',
			end: null
		});
	});

	it('allows a same-day trip', () => {
		expect(pickDate({ start: '2026-10-05', end: null }, '2026-10-05')).toEqual({
			start: '2026-10-05',
			end: '2026-10-05'
		});
	});
});

describe('months', () => {
	it('shifts across years and lists upcoming months', () => {
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftMonth('2027-01', -1)).toBe('2026-12');
		expect(upcomingMonths('2026-11-15', 3)).toEqual(['2026-11', '2026-12', '2027-01']);
		expect(nights('2026-10-05', '2026-10-09')).toBe(4);
	});
});
