import type { Flight, TimelineItem, Trip } from '#lib/server/db/schema.ts';
import { addDays } from './climate.ts';
import { itemIcon, MODE_LABELS } from './timeline.ts';
import { clockOf, flightMinutes, minutesOf } from './duration.ts';

/*
 * iCalendar (RFC 5545) export. Times are "floating": 09:40 stays 09:40 in
 * whatever time zone the phone is in, which matches how a timetable reads
 * (departure times are local to the airport).
 */

interface CalEvent {
	uid: string;
	summary: string;
	/** All-day: [first day, last day] inclusive. Timed: date plus HH:MM. */
	start: { date: string; time?: string | null };
	end?: { date: string; time?: string | null };
	/** Length of a timed event without an explicit end; an hour if unknown. */
	minutes?: number;
	location?: string | null;
	description?: string | null;
	url?: string | null;
}

const escape = (s: string) =>
	s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const compactDate = (d: string) => d.replaceAll('-', '');
const compactTime = (t: string) => `${t.replace(':', '').slice(0, 4)}00`;

/** Lines longer than 75 bytes continue on the next line after a space. */
function fold(line: string): string {
	const bytes = new TextEncoder();
	const out: string[] = [];
	let current = '';
	for (const ch of line) {
		const limit = out.length === 0 ? 75 : 74;
		if (bytes.encode(current + ch).length > limit) {
			out.push(current);
			current = '';
		}
		current += ch;
	}
	out.push(current);
	return out.join('\r\n ');
}

function plusMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
	const end = minutesOf(time) + minutes;
	return { date: addDays(date, Math.floor(end / 1440)), time: clockOf(end) };
}

function eventLines(e: CalEvent, stamp: string): string[] {
	const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`];
	if (e.start.time) {
		const end = e.end?.time
			? { date: e.end.date, time: e.end.time }
			: plusMinutes(e.start.date, e.start.time, e.minutes ?? 60);
		lines.push(`DTSTART:${compactDate(e.start.date)}T${compactTime(e.start.time)}`);
		lines.push(`DTEND:${compactDate(end.date)}T${compactTime(end.time)}`);
	} else {
		// All-day events end the day after the last day.
		lines.push(`DTSTART;VALUE=DATE:${compactDate(e.start.date)}`);
		lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(e.end?.date ?? e.start.date, 1))}`);
	}
	lines.push(`SUMMARY:${escape(e.summary)}`);
	if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
	if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
	if (e.url) lines.push(`URL:${e.url}`);
	lines.push('END:VEVENT');
	return lines;
}

function itemEvents(item: TimelineItem): CalEvent[] {
	if (!item.startDate) return [];
	const details = [item.reference && `Ref ${item.reference}`, item.notes]
		.filter(Boolean)
		.join('\n');
	const base = {
		location:
			item.kind === 'transport'
				? [item.fromPlace, item.toPlace].filter(Boolean).join(' → ') || null
				: item.location,
		description: details || null,
		url: item.url
	};
	const title = `${itemIcon(item)} ${item.title}${item.status === 'idea' ? ' (idea)' : ''}`;

	if (
		(item.kind === 'stay' || item.kind === 'car') &&
		item.endDate &&
		item.endDate !== item.startDate
	) {
		const [first, last] =
			item.kind === 'stay' ? ['Check-in', 'Check-out'] : ['Pick-up', 'Drop-off'];
		// The span as an all-day block, plus the timed moments if they're known.
		const events: CalEvent[] = [
			{
				uid: `${item.id}@jumpseat`,
				summary: title,
				// A hotel's nights: the check-out day itself isn't part of the stay.
				start: { date: item.startDate },
				end: { date: item.kind === 'stay' ? addDays(item.endDate, -1) : item.endDate },
				...base
			}
		];
		if (item.startTime) {
			events.push({
				uid: `${item.id}-start@jumpseat`,
				summary: `${first}: ${item.title}`,
				start: { date: item.startDate, time: item.startTime },
				...base
			});
		}
		if (item.endTime) {
			events.push({
				uid: `${item.id}-end@jumpseat`,
				summary: `${last}: ${item.title}`,
				start: { date: item.endDate, time: item.endTime },
				...base
			});
		}
		return events;
	}

	return [
		{
			uid: `${item.id}@jumpseat`,
			summary:
				item.kind === 'transport' && item.mode && !item.title.startsWith(MODE_LABELS[item.mode])
					? `${title} (${MODE_LABELS[item.mode]})`
					: title,
			start: { date: item.startDate, time: item.startTime },
			minutes: item.durationMinutes ?? undefined,
			...base
		}
	];
}

export function tripCalendar(
	trip: Pick<Trip, 'id' | 'title' | 'destination' | 'startDate' | 'endDate'>,
	flights: Flight[],
	items: TimelineItem[],
	now = new Date()
): string {
	const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
	const events: CalEvent[] = [];

	if (trip.startDate) {
		events.push({
			uid: `trip-${trip.id}@jumpseat`,
			summary: `🧳 ${trip.title}`,
			start: { date: trip.startDate },
			end: { date: trip.endDate ?? trip.startDate },
			location: trip.destination
		});
	}
	for (const f of flights) {
		events.push({
			uid: `flight-${f.id}@jumpseat`,
			summary: `✈️ ${f.flightNumber} ${f.origin} → ${f.destination}${f.standby ? ' (standby)' : ''}`,
			start: { date: f.departureDate, time: f.departureTime },
			minutes: flightMinutes(f),
			location: f.origin
		});
	}
	for (const item of items) events.push(...itemEvents(item));

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Jumpseat//Trip export//EN',
		'CALSCALE:GREGORIAN',
		`X-WR-CALNAME:${escape(trip.title)}`,
		...events.flatMap((e) => eventLines(e, stamp)),
		'END:VCALENDAR'
	];
	return lines.map(fold).join('\r\n') + '\r\n';
}
