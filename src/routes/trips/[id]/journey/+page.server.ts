import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { timelineItem } from '#lib/server/db/schema.ts';
import { field, getTripPlan, optionalField } from '#lib/server/trips.ts';
import { getNearbySights } from '#lib/server/wikipedia.ts';
import { scheduleTrip } from '#lib/schedule.ts';
import type { Actions, PageServerLoad } from './$types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const load: PageServerLoad = async ({ params }) => {
	const found = await getTripPlan(params.id);
	if (!found) error(404, 'Trip not found');
	const schedule = scheduleTrip(found.trip, found.flights, found.items);
	// Without real dates, days are numbered and drops set the trip day instead.
	const numbered = !schedule.start || schedule.undated;
	const { latitude, longitude } = found.trip;
	return {
		trip: found.trip,
		flights: found.flights,
		items: numbered ? found.items : schedule.items,
		start: numbered ? null : schedule.start,
		numbered,
		sights:
			latitude !== null && longitude !== null
				? getNearbySights(latitude, longitude).catch(() => [])
				: Promise.resolve([])
	};
};

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

export const actions: Actions = {
	/** Moves an idea onto a day and time, or back to the ideas tray. */
	place: async ({ params, request }) => {
		const data = await request.formData();
		const id = field(data, 'itemId');
		const [item] = await db
			.select()
			.from(timelineItem)
			.where(and(eq(timelineItem.id, id), eq(timelineItem.tripId, params.id)));
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

	/** Adds a new idea, from the tray's box or a suggested sight, optionally straight onto a day. */
	addIdea: async ({ params, request }) => {
		const data = await request.formData();
		const title = field(data, 'title').slice(0, 200);
		if (!title) return fail(400, { error: 'Give it a name.' });
		const url = optionalField(data, 'url');
		await db.insert(timelineItem).values({
			tripId: params.id,
			kind: 'other',
			title,
			status: 'idea',
			url: url && /^https?:\/\//i.test(url) ? url : null,
			notes: optionalField(data, 'notes'),
			...slotFrom(data)
		});
	}
};
