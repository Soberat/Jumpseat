import { describe, expect, it } from 'vitest';
import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
import { tripCalendar } from './ics.ts';

const trip = {
	id: 't1',
	title: 'Autumn in Lisbon',
	destination: 'Lisbon',
	startDate: '2026-11-05',
	endDate: '2026-11-09'
};

const flight: Flight = {
	id: 'f1',
	tripId: 't1',
	flightNumber: 'LH1166',
	origin: 'FRA',
	destination: 'LIS',
	departureDate: '2026-11-05',
	departureTime: '09:40',
	standby: true,
	createdAt: new Date(0)
};

const item = (extra: Partial<TimelineItem>): TimelineItem => ({
	id: 'i1',
	tripId: 't1',
	kind: 'other',
	title: 'Fado show',
	status: 'booked',
	startDate: null,
	startTime: null,
	endDate: null,
	endTime: null,
	location: null,
	mode: null,
	fromPlace: null,
	toPlace: null,
	reference: null,
	url: null,
	notes: null,
	createdAt: new Date(0),
	...extra
});

const now = new Date('2026-10-02T12:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('tripCalendar', () => {
	it('exports the trip span and a timed flight', () => {
		const ics = tripCalendar(trip, [flight], [], now);
		expect(ics).toContain('DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261110');
		expect(ics).toContain('SUMMARY:✈️ LH1166 FRA → LIS (standby)');
		expect(ics).toContain('DTSTART:20261105T094000\r\nDTEND:20261105T104000');
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
	});

	it('exports a stay as its nights plus check-in and check-out', () => {
		const stay = item({
			kind: 'stay',
			title: 'Hotel Avenida',
			startDate: '2026-11-05',
			startTime: '15:00',
			endDate: '2026-11-09',
			endTime: '11:00',
			reference: 'ABC; 123'
		});
		const ics = tripCalendar(trip, [], [stay], now);
		// Nights of 5–8 Nov; the all-day block ends before the check-out day.
		expect(ics).toContain(
			'UID:i1@jumpseat\r\nDTSTAMP:20261002T120000Z\r\nDTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261109'
		);
		expect(ics).toContain('SUMMARY:Check-in: Hotel Avenida');
		expect(ics).toContain('DTSTART:20261109T110000');
		expect(ics).toContain('DESCRIPTION:Ref ABC\\; 123');
	});

	it('skips undated items and folds long lines', () => {
		const ics = tripCalendar(
			{ ...trip, startDate: null, endDate: null },
			[],
			[item({ title: 'x'.repeat(200), startDate: '2026-11-06' }), item({ id: 'i2' })],
			now
		);
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
		expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
		expect(unfold(ics)).toContain(`📌 ${'x'.repeat(200)}`);
	});
});
