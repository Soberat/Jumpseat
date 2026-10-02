/**
 * When a trip happens. Plans start vague and firm up, so a trip has either exact dates,
 * a planned period (a month like "2027-04" or a quarter like "2027-Q2"), or nothing yet.
 */
export interface TripWhen {
	startDate: string | null;
	endDate: string | null;
	plannedPeriod: string | null;
}

export type WhenWindow =
	| { type: 'exact'; start: string; end: string }
	| { type: 'period'; period: string; months: string[] }
	| { type: 'none' };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2027-Q2" → ["2027-04", "2027-05", "2027-06"]; "2027-04" → ["2027-04"]; anything else → null. */
export function periodMonths(period: string): string[] | null {
	if (MONTH_RE.test(period)) return [period];
	const q = QUARTER_RE.exec(period);
	if (!q) return null;
	const first = (Number(q[2]) - 1) * 3 + 1;
	return [0, 1, 2].map((i) => `${q[1]}-${String(first + i).padStart(2, '0')}`);
}

export function whenWindow(when: TripWhen): WhenWindow {
	if (when.startDate)
		return { type: 'exact', start: when.startDate, end: when.endDate ?? when.startDate };
	const months = when.plannedPeriod ? periodMonths(when.plannedPeriod) : null;
	if (months) return { type: 'period', period: when.plannedPeriod!, months };
	return { type: 'none' };
}

const monthName = (month: string, style: 'long' | 'short' = 'long') =>
	new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-GB', {
		month: style,
		timeZone: 'UTC'
	});

function formatDate(date: string, withYear: boolean): string {
	return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(withYear ? { year: 'numeric' } : {}),
		timeZone: 'UTC'
	});
}

/** "3 – 7 Oct 2026", "April 2027", "Q2 2027 (Apr – Jun)", or "Dates not set". */
export function describeWhen(when: TripWhen): string {
	const w = whenWindow(when);
	if (w.type === 'exact') {
		if (w.start === w.end) return formatDate(w.start, true);
		const sameYear = w.start.slice(0, 4) === w.end.slice(0, 4);
		const sameMonth = w.start.slice(0, 7) === w.end.slice(0, 7);
		if (sameMonth) return `${Number(w.start.slice(8))} – ${formatDate(w.end, true)}`;
		return `${formatDate(w.start, !sameYear)} – ${formatDate(w.end, true)}`;
	}
	if (w.type === 'period') {
		const year = w.period.slice(0, 4);
		if (w.months.length === 1) return `${monthName(w.months[0])} ${year}`;
		return `Q${w.period.slice(-1)} ${year} (${monthName(w.months[0], 'short')} – ${monthName(w.months[2], 'short')})`;
	}
	return 'Dates not set';
}

/** Sorts exact trips by start, vague ones by the start of their period, undecided ones last. */
export function whenSortKey(when: TripWhen): string {
	const w = whenWindow(when);
	if (w.type === 'exact') return `${w.start}`;
	if (w.type === 'period') return `${w.months[0]}-01~`;
	return '9999';
}

export type WhenMode = 'exact' | 'month' | 'quarter' | 'none';

export function whenMode(when: TripWhen): WhenMode {
	const w = whenWindow(when);
	if (w.type === 'exact') return 'exact';
	if (w.type === 'period') return w.months.length === 1 ? 'month' : 'quarter';
	return 'none';
}

/** Reads the "when" fields of a trip form. Returns an error message for invalid input. */
export function parseWhen(data: FormData): TripWhen | { error: string } {
	const get = (name: string) => String(data.get(name) ?? '').trim();
	const none: TripWhen = { startDate: null, endDate: null, plannedPeriod: null };

	switch (get('when')) {
		case 'exact': {
			const startDate = get('startDate');
			const endDate = get('endDate') || startDate;
			if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
				return { error: 'Pick the start date (and end date, if you know it).' };
			}
			if (endDate < startDate) return { error: 'The trip has to end on or after it starts.' };
			return { ...none, startDate, endDate };
		}
		case 'month': {
			const month = get('month');
			return MONTH_RE.test(month) ? { ...none, plannedPeriod: month } : { error: 'Pick a month.' };
		}
		case 'quarter': {
			const quarter = get('quarter');
			return QUARTER_RE.test(quarter)
				? { ...none, plannedPeriod: quarter }
				: { error: 'Pick a quarter.' };
		}
		default:
			return none;
	}
}

/** The next `count` quarters starting with the one containing `today`, e.g. ["2026-Q4", "2027-Q1", …]. */
export function upcomingQuarters(today: string, count = 8): string[] {
	let year = Number(today.slice(0, 4));
	let q = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		out.push(`${year}-Q${q}`);
		if (++q > 4) {
			q = 1;
			year++;
		}
	}
	return out;
}
