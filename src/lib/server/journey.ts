import { error, fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { shareLink, timelineItem } from '#lib/server/db/schema.ts';
import { field, getTripPlan, optionalField } from '#lib/server/trips.ts';
import { getNearbySights } from '#lib/server/wikipedia.ts';
import { scheduleTrip } from '#lib/schedule.ts';
import { parseDuration } from '#lib/duration.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * What the journey view needs. Guests (share links) never see booking
 * references or what things cost; view-only guests don't see notes either.
 */
export async function journeyData(tripId: string, guest: 'view' | 'edit' | null = null) {
	const found = await getTripPlan(tripId);
	if (!found) error(404, 'Trip not found');
	const items = guest
		? found.items.map((i) => ({
				...i,
				reference: null,
				notes: guest === 'edit' ? i.notes : null
			}))
		: found.items;
	const flights = found.flights;
	const schedule = scheduleTrip(found.trip, flights, items);
	// Without real dates, days are numbered and drops set the trip day instead.
	const numbered = !schedule.start || schedule.undated;
	const { latitude, longitude } = found.trip;
	return {
		trip: {
			id: found.trip.id,
			title: found.trip.title,
			endDate: found.trip.endDate
		},
		flights,
		items: numbered ? items : schedule.items,
		start: numbered ? null : schedule.start,
		numbered,
		sights:
			latitude !== null && longitude !== null
				? getNearbySights(latitude, longitude).catch(() => [])
				: Promise.resolve([])
	};
}

/** The trip behind a live share link, or a 404. */
export async function sharedTrip(token: string) {
	const [link] = await db
		.select()
		.from(shareLink)
		.where(and(eq(shareLink.token, token), isNull(shareLink.revokedAt)));
	if (!link) error(404, 'This link has expired or never existed.');
	return link;
}

/** Reads the drop target: a date or a trip day, an optional time, or nothing (back to ideas). */
function slotFrom(data: FormData) {
	const date = field(data, 'date');
	const day = Number(field(data, 'day'));
	const time = field(data, 'time');
	return {
		startDate: DATE_RE.test(date) ? date : null,
		day: !DATE_RE.test(date) && Number.isInteger(day) && day > 0 && day <= 60 ? day : null,
		startTime: (DATE_RE.test(date) || day > 0) && TIME_RE.test(time) ? time : null
	};
}

/** Planning changes from the journey view, for a trip the caller may edit. */
export const journeyActions = {
	/** Moves an idea onto a day and time, or back to the ideas tray. */
	async place(tripId: string, request: Request) {
		const data = await request.formData();
		const id = field(data, 'itemId');
		const [item] = await db
			.select()
			.from(timelineItem)
			.where(and(eq(timelineItem.id, id), eq(timelineItem.tripId, tripId)));
		if (!item) return fail(404, { error: 'That entry is gone.' });
		// Stays and car rentals span days; they're moved on the trip page.
		if ((item.kind === 'stay' || item.kind === 'car') && item.endDate) {
			return fail(400, { error: 'Change stays and car rentals on the trip page.' });
		}
		await db
			.update(timelineItem)
			.set({ ...slotFrom(data), endDate: null, endTime: null })
			.where(eq(timelineItem.id, id));
	},

	/** Changes when something starts and how long it takes. */
	async edit(tripId: string, request: Request) {
		const data = await request.formData();
		const id = field(data, 'itemId');
		const [item] = await db
			.select()
			.from(timelineItem)
			.where(and(eq(timelineItem.id, id), eq(timelineItem.tripId, tripId)));
		if (!item) return fail(404, { error: 'That entry is gone.' });
		const changes: Partial<typeof item> = {};
		if (data.has('time')) {
			const time = field(data, 'time');
			if (time && !TIME_RE.test(time)) return fail(400, { error: 'Times look like 14:30.' });
			// Only things placed on a day can have a time.
			if (item.startDate || item.day) changes.startTime = time || null;
		}
		if (data.has('duration')) {
			const raw = field(data, 'duration');
			const minutes = parseDuration(raw);
			if (raw && minutes === null) return fail(400, { error: 'Try a length like 45m or 1h30.' });
			changes.durationMinutes = minutes;
		}
		if (Object.keys(changes).length) {
			await db.update(timelineItem).set(changes).where(eq(timelineItem.id, id));
		}
	},

	/** Adds a new idea, from the tray's box or a suggested sight, optionally straight onto a day. */
	async addIdea(tripId: string, request: Request) {
		const data = await request.formData();
		const title = field(data, 'title').slice(0, 200);
		if (!title) return fail(400, { error: 'Give it a name.' });
		const url = optionalField(data, 'url');
		await db.insert(timelineItem).values({
			tripId: tripId,
			kind: 'other',
			title,
			status: 'idea',
			url: url && /^https?:\/\//i.test(url) ? url : null,
			notes: optionalField(data, 'notes'),
			...slotFrom(data)
		});
	}
};
