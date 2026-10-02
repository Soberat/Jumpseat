import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { addDays, daysBetween } from './climate.ts';
import { clockOf, flightMinutes, itemMinutes, minutesOf } from './duration.ts';

export { clockOf, minutesOf };

/** The part of the day drawn, in minutes after midnight. */
export interface DayRange {
	start: number;
	end: number;
}

/** Days are drawn from 08:00 to 22:00 at least, widened to fit what's planned. */
export const DEFAULT_RANGE: DayRange = { start: 8 * 60, end: 22 * 60 };

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
	/** Length in minutes, and whether it's a typical length rather than one you set. */
	minutes: number;
	estimated: boolean;
}

/** The time at a point down a day column, snapped to `step` minutes. */
export function timeAt(fraction: number, range: DayRange, step = 5): string {
	const f = Math.min(1, Math.max(0, fraction));
	const m = Math.round((range.start + f * (range.end - range.start)) / step) * step;
	return clockOf(Math.min(Math.max(m, range.start), range.end - step, 1435));
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
				movable: false,
				minutes: flightMinutes(f),
				estimated: true
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
			movable: !spans,
			...itemMinutes(item)
		});
		if (spans && !undated) {
			add(item.endDate, {
				key: `${item.id}-end`,
				type: 'item',
				item,
				phase: phases![1],
				time: item.endTime,
				movable: false,
				...itemMinutes(item)
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

/** Draw range covering every timed card on the trip, in whole hours. */
export function dayRange(byDay: Map<string, JourneyCard[]>): DayRange {
	let { start, end } = DEFAULT_RANGE;
	for (const cards of byDay.values()) {
		for (const c of cards) {
			if (!c.time) continue;
			const from = minutesOf(c.time);
			start = Math.min(start, Math.floor(from / 60) * 60);
			end = Math.max(end, Math.min(24 * 60, Math.ceil((from + c.minutes) / 60) * 60));
		}
	}
	return { start, end };
}

export interface PlacedCard {
	card: JourneyCard;
	start: number;
	end: number;
	/** Side-by-side position when things overlap. */
	lane: number;
	lanes: number;
	/** Clashes with something else that day. */
	overlaps: boolean;
}

/** The space between two things: free time, or (negative) a clash. */
export interface Gap {
	from: number;
	to: number;
	minutes: number;
}

/**
 * Places a day's timed cards by start and length, splitting clashes into
 * side-by-side lanes, and measures the free time between them.
 */
export function layoutDay(cards: JourneyCard[]): { placed: PlacedCard[]; gaps: Gap[] } {
	const timed = cards
		.filter((c) => c.time)
		.map((card) => {
			const start = minutesOf(card.time!);
			return {
				card,
				start,
				end: Math.min(start + card.minutes, 24 * 60),
				lane: 0,
				lanes: 1,
				overlaps: false
			};
		})
		.sort((a, b) => a.start - b.start || b.end - a.end);

	const placed: PlacedCard[] = [];
	const gaps: Gap[] = [];
	let cluster: PlacedCard[] = [];
	let clusterEnd = -1;
	const close = () => {
		const lanes = Math.max(...cluster.map((p) => p.lane)) + 1;
		for (const p of cluster) {
			p.lanes = lanes;
			p.overlaps = lanes > 1;
		}
	};
	for (const p of timed) {
		if (cluster.length && p.start >= clusterEnd) {
			close();
			if (p.start > clusterEnd)
				gaps.push({ from: clusterEnd, to: p.start, minutes: p.start - clusterEnd });
			cluster = [];
		}
		const used = new Set(cluster.filter((q) => q.end > p.start).map((q) => q.lane));
		let lane = 0;
		while (used.has(lane)) lane++;
		p.lane = lane;
		cluster.push(p);
		placed.push(p);
		clusterEnd = Math.max(clusterEnd, p.end);
	}
	if (cluster.length) close();
	return { placed, gaps };
}
