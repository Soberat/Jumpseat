import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { airportByCode } from './airports.ts';
import { distanceKm } from './route.ts';

/** How long things usually take when no duration was entered. */
const DEFAULT_MINUTES: Record<TimelineItem['kind'], number> = {
	stay: 30,
	car: 30,
	transport: 45,
	restaurant: 90,
	other: 90
};

export const MAX_MINUTES = 24 * 60;

/** Block time for a flight: the scheduled one if looked up, else ~780 km/h plus taxi, climb and descent. */
export function flightMinutes(
	f: Pick<Flight, 'origin' | 'destination'> & { durationMinutes?: number | null }
): number {
	if (f.durationMinutes) return f.durationMinutes;
	const a = airportByCode(f.origin);
	const b = airportByCode(f.destination);
	if (!a || !b) return 120;
	return Math.round((distanceKm(a, b) / 780) * 12 + 7) * 5;
}

/** An item's length in minutes and whether that's a guess. */
export function itemMinutes(item: Pick<TimelineItem, 'kind' | 'durationMinutes'>): {
	minutes: number;
	estimated: boolean;
} {
	return item.durationMinutes
		? { minutes: item.durationMinutes, estimated: false }
		: { minutes: DEFAULT_MINUTES[item.kind], estimated: true };
}

export const minutesOf = (time: string) => {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + (m || 0);
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" for minutes after midnight; past midnight wraps (25:30 → 01:30). */
export const clockOf = (minutes: number) => {
	const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
	return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/** "45 min", "1 h", "1 h 30". */
export function formatDuration(minutes: number): string {
	const m = Math.round(minutes);
	if (m < 60) return `${m} min`;
	const h = Math.floor(m / 60);
	return m % 60 ? `${h} h ${pad(m % 60)}` : `${h} h`;
}

/** Reads "90", "1h30", "1h 30m", "1:30", "2h", "45m", "1.5h". Null when empty or unreadable. */
export function parseDuration(input: string | null | undefined): number | null {
	const s = (input ?? '').trim().toLowerCase().replace(/\s+/g, '');
	if (!s) return null;
	let m: number | null = null;
	let match;
	if (/^\d+$/.test(s)) m = Number(s);
	else if ((match = s.match(/^(\d+):([0-5]\d)$/))) m = Number(match[1]) * 60 + Number(match[2]);
	else if ((match = s.match(/^(\d+(?:[.,]\d+)?)h$/))) m = Number(match[1].replace(',', '.')) * 60;
	else if ((match = s.match(/^(?:(\d+)h)?(?:(\d+)(?:m|min)?)?$/)) && (match[1] || match[2]))
		m = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
	if (m === null || !Number.isFinite(m)) return null;
	m = Math.round(m);
	return m > 0 && m <= MAX_MINUTES ? m : null;
}
