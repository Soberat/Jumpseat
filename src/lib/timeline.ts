import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';

export const TIMELINE_KINDS = ['stay', 'car', 'transport', 'restaurant', 'other'] as const;
export const TRANSPORT_MODES = [
	'train',
	'bus',
	'metro',
	'taxi',
	'private',
	'ferry',
	'other'
] as const;

export type TimelineKind = (typeof TIMELINE_KINDS)[number];
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const KIND_LABELS: Record<TimelineKind | 'flight', string> = {
	flight: 'Flight',
	stay: 'Stay',
	car: 'Car rental',
	transport: 'Transport',
	restaurant: 'Restaurant',
	other: 'Other'
};

export const MODE_LABELS: Record<TransportMode, string> = {
	train: 'Train',
	bus: 'Bus',
	metro: 'Metro',
	taxi: 'Taxi',
	private: 'Private transfer',
	ferry: 'Ferry',
	other: 'Other'
};

const KIND_ICONS: Record<TimelineKind, string> = {
	stay: '🏨',
	car: '🚗',
	transport: '🚏',
	restaurant: '🍽️',
	other: '📌'
};

const MODE_ICONS: Record<TransportMode, string> = {
	train: '🚆',
	bus: '🚌',
	metro: '🚇',
	taxi: '🚕',
	private: '🚐',
	ferry: '⛴️',
	other: '🚏'
};

export function itemIcon(item: Pick<TimelineItem, 'kind' | 'mode'>): string {
	if (item.kind === 'transport' && item.mode) return MODE_ICONS[item.mode];
	return KIND_ICONS[item.kind];
}

/** Stays and car rentals show up twice: when they start and when they end. */
const SPANNING: Partial<Record<TimelineKind, [start: string, end: string]>> = {
	stay: ['Check-in', 'Check-out'],
	car: ['Pick-up', 'Drop-off']
};

export type Phase = 'start' | 'end' | 'single';

export type TimelineEntry =
	| { key: string; date: string; time: string | null; type: 'flight'; flight: Flight }
	| {
			key: string;
			date: string;
			time: string | null;
			type: 'item';
			item: TimelineItem;
			phase: Phase;
			/** "Check-in", "Drop-off"… for spanning items; null otherwise. */
			phaseLabel: string | null;
	  };

export interface TimelineDay {
	date: string;
	entries: TimelineEntry[];
}

export interface Timeline {
	days: TimelineDay[];
	/** Items without a date yet, like restaurant ideas. */
	unscheduled: TimelineItem[];
}

// On the same day, untimed entries come first, and endings before beginnings
// (check out of one hotel before checking in to the next).
const PHASE_ORDER: Record<Phase, number> = { end: 0, single: 1, start: 2 };

function sortKey(e: TimelineEntry): string {
	const phase = e.type === 'item' ? PHASE_ORDER[e.phase] : PHASE_ORDER.single;
	return `${e.date} ${e.time ?? ''} ${phase}`;
}

export function buildTimeline(flights: Flight[], items: TimelineItem[]): Timeline {
	const entries: TimelineEntry[] = flights.map((f) => ({
		key: `flight-${f.id}`,
		date: f.departureDate,
		time: f.departureTime,
		type: 'flight',
		flight: f
	}));
	const unscheduled: TimelineItem[] = [];

	for (const item of items) {
		if (!item.startDate) {
			unscheduled.push(item);
			continue;
		}
		const labels = SPANNING[item.kind];
		const spans = labels && item.endDate && item.endDate !== item.startDate;
		entries.push({
			key: `${item.id}-start`,
			date: item.startDate,
			time: item.startTime,
			type: 'item',
			item,
			phase: spans ? 'start' : 'single',
			phaseLabel: labels ? labels[0] : null
		});
		if (spans) {
			entries.push({
				key: `${item.id}-end`,
				date: item.endDate!,
				time: item.endTime,
				type: 'item',
				item,
				phase: 'end',
				phaseLabel: labels[1]
			});
		}
	}

	entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

	const days: TimelineDay[] = [];
	for (const entry of entries) {
		const last = days.at(-1);
		if (last?.date === entry.date) last.entries.push(entry);
		else days.push({ date: entry.date, entries: [entry] });
	}
	return { days, unscheduled };
}

/** "Train · Lisbon → Sintra" style fallback when a transport leg has no title. */
export function transportTitle(
	mode: TransportMode | null,
	from: string | null,
	to: string | null
): string {
	const route = from && to ? `${from} → ${to}` : (from ?? to ?? '');
	const label = mode ? MODE_LABELS[mode] : 'Transport';
	return route ? `${label} · ${route}` : label;
}
