import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { addDays } from './climate.ts';

/**
 * Stand-in start for trips with no dates at all, so "Day 3" ideas still line up
 * on the timeline. Views told `undated` show day numbers, never these dates.
 */
export const UNDATED_START = '2000-01-03';

/** Gives items that only know their trip day ("Day 3") a date counted from `start`. */
export function placeByDay(items: TimelineItem[], start: string | null): TimelineItem[] {
	if (!start) return items;
	return items.map((i) =>
		!i.startDate && i.day ? { ...i, startDate: addDays(start, i.day - 1) } : i
	);
}

export interface Schedule {
	items: TimelineItem[];
	/** Day 1 of the trip, for numbering days; null when nothing is placed in time. */
	start: string | null;
	/** True when `start` is a stand-in: show "Day N" without dates. */
	undated: boolean;
}

/**
 * Where a trip's items sit in time. A trip with only a month ("November")
 * still has a Day 1: its earliest booked date, or a stand-in when only
 * day-numbered plan ideas exist.
 */
export function scheduleTrip(
	trip: { startDate: string | null },
	flights: Flight[],
	items: TimelineItem[]
): Schedule {
	const known = [
		trip.startDate,
		...flights.map((f) => f.departureDate),
		...items.map((i) => i.startDate)
	].filter((d): d is string => Boolean(d));
	const earliest = known.length > 0 ? known.reduce((a, b) => (a < b ? a : b)) : null;
	const start = trip.startDate ?? earliest;
	if (start) return { items: placeByDay(items, start), start, undated: false };
	if (items.some((i) => i.day)) {
		return { items: placeByDay(items, UNDATED_START), start: UNDATED_START, undated: true };
	}
	return { items, start: null, undated: false };
}
