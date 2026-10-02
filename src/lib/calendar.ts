/** Calendar helpers for the date range picker. Dates are "YYYY-MM-DD", months "YYYY-MM". */

export function shiftMonth(month: string, by: number): string {
	const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
	return d.toISOString().slice(0, 7);
}

/** Weeks of a month, Monday first; days outside the month are null. */
export function monthGrid(month: string): (string | null)[][] {
	const year = Number(month.slice(0, 4));
	const m = Number(month.slice(5, 7));
	const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
	const firstWeekday = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
	const cells: (string | null)[] = Array(firstWeekday).fill(null);
	for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
	while (cells.length % 7) cells.push(null);
	const weeks: (string | null)[][] = [];
	for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
	return weeks;
}

export interface Range {
	start: string | null;
	end: string | null;
}

/**
 * Airbnb-style picking: the first tap sets check-in, the second sets check-out.
 * Tapping before check-in, or after a full range is chosen, starts over.
 */
export function pickDate(range: Range, date: string): Range {
	if (!range.start || range.end || date < range.start) return { start: date, end: null };
	return { start: range.start, end: date };
}

export function nights(start: string, end: string): number {
	return Math.round(
		(Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000
	);
}

/** The next `count` months starting with the one containing `today`. */
export function upcomingMonths(today: string, count = 12): string[] {
	return Array.from({ length: count }, (_, i) => shiftMonth(today.slice(0, 7), i));
}
