import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { shareLink } from '#lib/server/db/schema.ts';
import { getTripWeather } from '#lib/server/open-meteo.ts';
import { whenWindow } from '#lib/when.ts';
import { getTripPlan } from '#lib/server/trips.ts';
import { tripRoute } from '#lib/trip-route.ts';
import { buildTimeline } from '#lib/timeline.ts';
import { scheduleTrip } from '#lib/schedule.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const [link] = await db
		.select()
		.from(shareLink)
		.where(and(eq(shareLink.token, params.token), isNull(shareLink.revokedAt)));
	if (!link) error(404, 'This link has expired or never existed.');

	const found = await getTripPlan(link.tripId);
	if (!found) error(404, 'This link has expired or never existed.');

	setHeaders({ 'x-robots-tag': 'noindex', 'cache-control': 'private, no-store' });

	const { trip } = found;
	const weather =
		trip.latitude !== null && trip.longitude !== null
			? await getTripWeather(trip.latitude, trip.longitude, whenWindow(trip))
			: null;

	// Only what a guest should see: no notes, booking references, costs or standby loads.
	const items = found.items.map((i) => ({ ...i, notes: null, reference: null }));
	const flights = found.flights;
	const schedule = scheduleTrip(trip, flights, items);
	return {
		trip: {
			title: trip.title,
			destination: trip.destination,
			startDate: trip.startDate,
			endDate: trip.endDate,
			plannedPeriod: trip.plannedPeriod,
			timezone: trip.timezone,
			hasLocation: trip.latitude !== null
		},
		timeline: buildTimeline(flights, schedule.items),
		token: params.token,
		canEdit: link.canEdit,
		schedule: { start: schedule.start, undated: schedule.undated },
		route: tripRoute(trip, found.flights),
		today: new Date().toISOString().slice(0, 10),
		weather
	};
};
