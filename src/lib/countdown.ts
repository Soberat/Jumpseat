import { daysBetween } from './climate.ts';
import { periodMonths, type TripWhen } from './when.ts';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export type Phase = 'someday' | 'planning' | 'upcoming' | 'travelling' | 'past';

export interface Countdown {
	phase: Phase;
	/** Short board text, e.g. "34", "DAY 2", "APR 27". */
	big: string;
	/** Caption under it, e.g. "DAYS TO GO". */
	caption: string;
	/** Status word for a boarding pass. */
	status: string;
}

export function countdown(when: TripWhen, today: string): Countdown {
	if (when.startDate) {
		const end = when.endDate ?? when.startDate;
		const until = daysBetween(today, when.startDate);
		if (until > 1)
			return { phase: 'upcoming', big: String(until), caption: 'DAYS TO GO', status: 'ON TIME' };
		if (until === 1)
			return { phase: 'upcoming', big: '1', caption: 'DAY TO GO', status: 'BOARDING' };
		if (today <= end) {
			const day = daysBetween(when.startDate, today) + 1;
			return {
				phase: 'travelling',
				big: `DAY ${day}`,
				caption: `OF ${daysBetween(when.startDate, end) + 1}`,
				status: 'IN FLIGHT'
			};
		}
		return { phase: 'past', big: 'DONE', caption: 'LANDED', status: 'LANDED' };
	}
	const months = when.plannedPeriod ? periodMonths(when.plannedPeriod) : null;
	if (months) {
		const [y, m] = months[0].split('-').map(Number);
		const label =
			months.length === 1
				? `${MONTHS[m - 1]} ${String(y).slice(2)}`
				: `Q${Math.ceil(m / 3)} ${String(y).slice(2)}`;
		return { phase: 'planning', big: label, caption: 'PENCILLED IN', status: 'PLANNING' };
	}
	return { phase: 'someday', big: 'TBD', caption: 'SOMEDAY', status: 'DREAMING' };
}

/** A stable hue per destination, so each trip gets its own colour. */
export function placeHue(place: string): number {
	let h = 7;
	for (const c of place.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return h % 360;
}
