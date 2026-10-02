import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { daysBetween } from './climate.ts';
import { itemIcon, transportTitle } from './timeline.ts';

/** One shape on the visual timeline. Positions are in days from the first day (0 = its midnight). */
export interface GanttBar {
	key: string;
	/** Matches the TimelineEntry key of the card it scrolls to. */
	target: string;
	kind: 'flight' | 'stay' | 'car' | 'transport' | 'restaurant' | 'other';
	label: string;
	sub: string | null;
	icon: string;
	start: number;
	end: number;
	/** Point events (a dinner) vs spans (a hotel stay). */
	point: boolean;
	idea: boolean;
	/** Time wasn't given; placed at a sensible default. */
	approximate: boolean;
}

export interface GanttLane {
	name: string;
	/** Bars split into rows so nothing overlaps. */
	rows: GanttBar[][];
}

export interface Gantt {
	days: string[];
	lanes: GanttLane[];
}

const minutes = (time: string | null) => {
	if (!time) return null;
	const [h, m] = time.split(':').map(Number);
	return (h * 60 + m) / 1440;
};

/** Typical times when none was entered. */
const DEFAULT_TIME: Record<GanttBar['kind'], [start: number, end: number]> = {
	flight: [10 / 24, 10 / 24],
	stay: [15 / 24, 11 / 24],
	car: [10 / 24, 10 / 24],
	transport: [10 / 24, 10 / 24],
	restaurant: [19.5 / 24, 19.5 / 24],
	other: [11 / 24, 11 / 24]
};

/** Flights take a couple of hours on the chart; we don't know arrival times. */
const FLIGHT_SPAN = 2.5 / 24;
/** Room a point marker's label needs before the next one must go on a new row
 * (the chart draws at least 150px per day; a marker and its label take ~140px). */
export const POINT_ROOM = 0.95;
/** Legs departing within this long of the previous one count as a connection. */
const CONNECTION = 8 / 24;

/** Greedy row packing: each bar goes in the first row where it doesn't overlap. */
function pack(bars: GanttBar[]): GanttBar[][] {
	const rows: GanttBar[][] = [];
	for (const bar of [...bars].sort((a, b) => a.start - b.start)) {
		const row = rows.find((r) => {
			const last = r[r.length - 1];
			return (last.point ? Math.max(last.end, last.start + POINT_ROOM) : last.end) <= bar.start;
		});
		if (row) row.push(bar);
		else rows.push([bar]);
	}
	return rows;
}

export function buildGantt(
	flights: Flight[],
	items: TimelineItem[],
	trip: { startDate: string | null; endDate: string | null }
): Gantt | null {
	const dates = [
		trip.startDate,
		trip.endDate,
		...flights.map((f) => f.departureDate),
		...items.flatMap((i) => [i.startDate, i.endDate])
	].filter((d): d is string => Boolean(d));
	if (dates.length === 0) return null;
	const first = dates.reduce((a, b) => (a < b ? a : b));
	const last = dates.reduce((a, b) => (a > b ? a : b));
	const count = Math.min(daysBetween(first, last) + 1, 60);
	const days = Array.from({ length: count }, (_, i) => {
		const d = new Date(`${first}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() + i);
		return d.toISOString().slice(0, 10);
	});
	const at = (date: string, time: string | null, fallback: number) =>
		daysBetween(first, date) + (minutes(time) ?? fallback);

	// Connecting flights (KRK → MUC → LIS) read as one journey on the chart.
	const sorted = flights
		.map((f) => ({ f, start: at(f.departureDate, f.departureTime, DEFAULT_TIME.flight[0]) }))
		.sort((a, b) => a.start - b.start);
	const journeys: (typeof sorted)[] = [];
	for (const leg of sorted) {
		const prev = journeys.at(-1)?.at(-1);
		if (prev && prev.f.destination === leg.f.origin && leg.start - prev.start <= CONNECTION) {
			journeys.at(-1)!.push(leg);
		} else journeys.push([leg]);
	}
	const flightBars: GanttBar[] = journeys.map((legs) => {
		const head = legs[0];
		return {
			key: `g-flight-${head.f.id}`,
			target: `flight-${head.f.id}`,
			kind: 'flight',
			label: [head.f.origin, ...legs.map((l) => l.f.destination)].join(' → '),
			sub: legs.map((l) => l.f.flightNumber).join(' + '),
			icon: '✈️',
			start: head.start,
			end: legs.at(-1)!.start + FLIGHT_SPAN,
			point: true,
			idea: false,
			approximate: legs.some((l) => !l.f.departureTime)
		};
	});

	const spans: GanttBar[] = [];
	const plans: GanttBar[] = [];
	for (const item of items) {
		if (!item.startDate) continue;
		const [defStart, defEnd] = DEFAULT_TIME[item.kind];
		const start = at(item.startDate, item.startTime, defStart);
		const spanning = (item.kind === 'stay' || item.kind === 'car') && item.endDate;
		const bar: GanttBar = {
			key: `g-${item.id}`,
			target: `${item.id}-start`,
			kind: item.kind,
			label:
				item.kind === 'transport' && !item.title
					? transportTitle(item.mode, item.fromPlace, item.toPlace)
					: item.title,
			sub:
				item.kind === 'transport'
					? [item.fromPlace, item.toPlace].filter(Boolean).join(' → ') || null
					: item.location,
			icon: itemIcon(item),
			start,
			end: spanning ? Math.max(at(item.endDate!, item.endTime, defEnd), start + 0.1) : start,
			point: !spanning,
			idea: item.status === 'idea',
			approximate: !item.startTime
		};
		(spanning ? spans : plans).push(bar);
	}

	const lanes: GanttLane[] = [
		{ name: 'Flights', rows: pack(flightBars) },
		{ name: 'Stays & cars', rows: pack(spans) },
		{ name: 'Plans', rows: pack(plans) }
	].filter((l) => l.rows.length > 0);
	return { days, lanes };
}
