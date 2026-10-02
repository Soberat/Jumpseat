import { describeWhen, type TripWhen } from './when.ts';

/** "Lisbon · 3 – 7 Oct 2026", "Tokyo · Q2 2027 (Apr – Jun)", "Oslo · Dates not set". */
export function placeAndWhen(place: string, when: TripWhen): string {
	return `${place} · ${describeWhen(when)}`;
}

/**
 * One place that decides how dates, times and numbers look, so the server
 * (which has no locale of its own) and every browser agree.
 *
 * Polish conventions: day before month, a 24-hour clock, 05.11.2026 for
 * numeric dates, Monday-first weeks. Words (weekdays, months) are in
 * `LOCALE`; switch it to 'pl-PL' to have those in Polish too.
 */
export const LOCALE = 'en-GB';
/** Numbers and money: Polish grouping and decimal comma (1 234,50 zł). */
export const NUMBER_LOCALE = 'pl-PL';

const pad = (n: number) => String(n).padStart(2, '0');

/** 24-hour "17:25", optionally in another time zone. */
export function formatClock(d: Date, timeZone?: string): string {
	return new Intl.DateTimeFormat(LOCALE, {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone
	}).format(d);
}

/** "05.11.2026" for a "YYYY-MM-DD" string or a Date (local date). */
export function formatNumericDate(date: string | Date): string {
	if (typeof date === 'string') {
		const [y, m, d] = date.split('-');
		return `${d}.${m}.${y}`;
	}
	return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** "05.11.2026, 17:25": when something was recorded. */
export function formatStamp(d: Date): string {
	return `${formatNumericDate(d)}, ${formatClock(d)}`;
}

export function formatNumber(n: number): string {
	return new Intl.NumberFormat(NUMBER_LOCALE).format(n);
}
