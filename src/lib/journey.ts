import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { addDays, daysBetween } from './climate.ts';

/** The journey view draws each day from 06:00 to midnight. */
export const DAY_START = 6 * 60;
export const DAY_END = 24 * 60;
const SPAN = DAY_END - DAY_START;

/** One column of the journey view. */
export interface JourneyDay {
	/** Stable key: the date, or "day-3" on trips without dates. */
	key: string;
	/** Real calendar date, or null while the trip only has a month. */
	date: string | null;
	/** 1-based day of the trip. */
	day: number;
}

/** Where something can be dropped: a day, at a time or "any time". */
export interface Slot {
	date: string | null;
	day: number;
	time: string | null;
}

export interface JourneyCard {
	key: string;
	type: 'flight' | 'item';
	flight?: Flight;
	item?: TimelineItem;
	/** "Check-in", "Drop-off"… for stays and car rentals. */
	phase: string | null;
	time: string | null;
	/** Can be dragged elsewhere (stays and cars span days, so they stay put). */
	movable: boolean;
}

export const minutesOf = (time: string) => {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + (m || 0);
};

const pad = (n: number) => String(n).padStart(2, '0');
export const clockOf = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** 0 at 06:00, 1 at midnight; earlier times sit at the top. */
export function fractionOf(time: string): number {
	return Math.min(1, Math.max(0, (minutesOf(time) - DAY_START) / SPAN));
}

/** The time at a point down a day column, snapped to a quarter hour. */
export function timeAt(fraction: number): string {
	const f = Math.min(1, Math.max(0, fraction));
	const m = Math.round((DAY_START + f * SPAN) / 15) * 15;
	return clockOf(Math.min(m, DAY_END - 15));
}

/**
 * The days to draw. A dated trip shows its dates (stretched to anything
 * booked outside them). A trip with only a month shows the planned days plus
 * an empty one to drop new ideas onto.
 */
export function journeyDays(
	start: string | null,
	undated: boolean,
	end: string | null,
	flights: Flight[],
	items: TimelineItem[]
): JourneyDay[] {
	if (!start || undated) {
		const planned = Math.max(0, ...items.map((i) => i.day ?? 0));
		const count = Math.min(Math.max(planned + 1, 3), 30);
		return Array.from({ length: count }, (_, i) => ({
			key: `day-${i + 1}`,
			date: null,
			day: i + 1
		}));
	}
	const dates = [
		start,
		end,
		...flights.map((f) => f.departureDate),
		...items.flatMap((i) => [i.startDate, i.endDate])
	].filter((d): d is string => Boolean(d));
	const first = dates.reduce((a, b) => (a < b ? a : b));
	const last = dates.reduce((a, b) => (a > b ? a : b));
	const count = Math.min(daysBetween(first, last) + 1, 60);
	return Array.from({ length: count }, (_, i) => {
		const date = addDays(first, i);
		return { key: date, date, day: daysBetween(start, date) + 1 };
	});
}

/** The day an item sits on in this view, if any. */
function dayKey(item: TimelineItem, undated: boolean): string | null {
	if (undated) return item.day ? `day-${item.day}` : null;
	return item.startDate;
}

const PHASES: Partial<Record<TimelineItem['kind'], [string, string]>> = {
	stay: ['Check-in', 'Check-out'],
	car: ['Pick-up', 'Drop-off']
};

/** Cards per day key, in time order (untimed first). */
export function cardsByDay(
	flights: Flight[],
	items: TimelineItem[],
	undated: boolean
): Map<string, JourneyCard[]> {
	const out = new Map<string, JourneyCard[]>();
	const add = (key: string | null, card: JourneyCard) => {
		if (!key) return;
		out.set(key, [...(out.get(key) ?? []), card]);
	};
	if (!undated) {
		for (const f of flights) {
			add(f.departureDate, {
				key: `flight-${f.id}`,
				type: 'flight',
				flight: f,
				phase: null,
				time: f.departureTime,
				movable: false
			});
		}
	}
	for (const item of items) {
		const phases = PHASES[item.kind];
		const spans = Boolean(phases && item.endDate && item.endDate !== item.startDate);
		add(dayKey(item, undated), {
			key: `${item.id}-start`,
			type: 'item',
			item,
			phase: phases ? phases[0] : null,
			time: item.startTime,
			movable: !spans
		});
		if (spans && !undated) {
			add(item.endDate, {
				key: `${item.id}-end`,
				type: 'item',
				item,
				phase: phases![1],
				time: item.endTime,
				movable: false
			});
		}
	}
	for (const cards of out.values()) {
		cards.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
	}
	return out;
}

/** Ideas not placed on any day yet: the tray. */
export function trayItems(items: TimelineItem[], undated: boolean): TimelineItem[] {
	return items.filter((i) => !dayKey(i, undated) && !i.startDate);
}

/** Which stay you sleep in on the night after `date`. */
export function stayFor(date: string | null, items: TimelineItem[]): TimelineItem | null {
	if (!date) return null;
	return (
		items.find(
			(i) =>
				i.kind === 'stay' && i.startDate && i.endDate && i.startDate <= date && date < i.endDate
		) ?? null
	);
}

/**
 * Vertical positions (px) for timed cards in a column, pushed down so they
 * don't overlap, then squeezed up again if they run off the bottom.
 */
export function stackCards(fractions: number[], height: number, cardHeight: number): number[] {
	const tops: number[] = [];
	for (const f of fractions) {
		const want = f * height;
		tops.push(Math.max(want, tops.length ? tops[tops.length - 1] + cardHeight : 0));
	}
	let limit = height - cardHeight;
	for (let i = tops.length - 1; i >= 0; i--) {
		tops[i] = Math.max(0, Math.min(tops[i], limit));
		limit = tops[i] - cardHeight;
	}
	return tops;
}
