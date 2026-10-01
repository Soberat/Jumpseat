import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { shareLink } from '#lib/server/db/schema.ts';
import { getForecast } from '#lib/server/open-meteo.ts';
import { getTripWithFlights } from '#lib/server/trips.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const [link] = await db
		.select()
		.from(shareLink)
		.where(and(eq(shareLink.token, params.token), isNull(shareLink.revokedAt)));
	if (!link) error(404, 'This link has expired or never existed.');

	const found = await getTripWithFlights(link.tripId);
	if (!found) error(404, 'This link has expired or never existed.');

	setHeaders({ 'x-robots-tag': 'noindex', 'cache-control': 'private, no-store' });

	const { trip } = found;
	const forecast =
		trip.latitude !== null && trip.longitude !== null
			? await getForecast(trip.latitude, trip.longitude)
			: null;

	// Only what a guest should see: no notes, no standby loads.
	return {
		trip: {
			title: trip.title,
			destination: trip.destination,
			startDate: trip.startDate,
			endDate: trip.endDate,
			hasLocation: trip.latitude !== null
		},
		flights: found.flights,
		forecast
	};
};
