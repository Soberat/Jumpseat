import { randomBytes } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { PUBLIC_ORIGIN } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { flight, shareLink, standbyLoad, trip } from '#lib/server/db/schema.ts';
import { geocode, getForecast } from '#lib/server/open-meteo.ts';
import { field, getLoadsForFlights, getTripWithFlights, optionalField } from '#lib/server/trips.ts';
import type { Actions, PageServerLoad } from './$types';

const CABINS = ['economy', 'premium', 'business', 'first'] as const;

export const load: PageServerLoad = async ({ params, url }) => {
	const found = await getTripWithFlights(params.id);
	if (!found) error(404, 'Trip not found');

	// The lookup may have failed when the trip was created (offline, typo); retry it.
	if (found.trip.latitude === null) {
		const place = await geocode(found.trip.destination).catch(() => null);
		if (place) {
			const coords = {
				latitude: place.latitude,
				longitude: place.longitude,
				timezone: place.timezone
			};
			await db.update(trip).set(coords).where(eq(trip.id, params.id));
			Object.assign(found.trip, coords);
		}
	}

	const [loads, shares, forecast] = await Promise.all([
		getLoadsForFlights(found.flights.map((f) => f.id)),
		db
			.select()
			.from(shareLink)
			.where(and(eq(shareLink.tripId, params.id), isNull(shareLink.revokedAt)))
			.orderBy(desc(shareLink.createdAt)),
		found.trip.latitude !== null && found.trip.longitude !== null
			? getForecast(found.trip.latitude, found.trip.longitude)
			: Promise.resolve(null)
	]);

	const origin = PUBLIC_ORIGIN ?? url.origin;
	return {
		...found,
		loads,
		forecast,
		shares: shares.map((s) => ({ token: s.token, url: `${origin}/s/${s.token}` }))
	};
};

export const actions: Actions = {
	addFlight: async ({ params, request }) => {
		const data = await request.formData();
		const flightNumber = field(data, 'flightNumber').toUpperCase().replace(/\s+/g, '');
		const origin = field(data, 'origin').toUpperCase();
		const destination = field(data, 'destination').toUpperCase();
		const departureDate = field(data, 'departureDate');
		if (!flightNumber || !origin || !destination || !departureDate) {
			return fail(400, { flightError: 'Flight number, route and date are required.' });
		}
		await db.insert(flight).values({
			tripId: params.id,
			flightNumber,
			origin,
			destination,
			departureDate,
			departureTime: optionalField(data, 'departureTime'),
			standby: data.get('standby') === 'on'
		});
	},

	deleteFlight: async ({ params, request }) => {
		const id = field(await request.formData(), 'flightId');
		await db.delete(flight).where(and(eq(flight.id, id), eq(flight.tripId, params.id)));
	},

	logLoad: async ({ params, request }) => {
		const data = await request.formData();
		const flightId = field(data, 'flightId');
		const seatsAvailable = Number(field(data, 'seatsAvailable'));
		const listedRaw = field(data, 'standbyListed');
		const standbyListed = listedRaw === '' ? null : Number(listedRaw);
		const cabin = field(data, 'cabin') as (typeof CABINS)[number];

		const isCount = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0);
		if (!isCount(seatsAvailable) || !isCount(standbyListed) || !CABINS.includes(cabin)) {
			return fail(400, { loadError: 'Seat counts must be whole numbers.', flightId });
		}
		const [owner] = await db
			.select({ id: flight.id })
			.from(flight)
			.where(and(eq(flight.id, flightId), eq(flight.tripId, params.id)));
		if (!owner) error(404, 'Flight not found');

		await db.insert(standbyLoad).values({
			flightId,
			cabin,
			seatsAvailable,
			standbyListed,
			note: optionalField(data, 'note')
		});
	},

	share: async ({ params }) => {
		await db
			.insert(shareLink)
			.values({ token: randomBytes(18).toString('base64url'), tripId: params.id });
	},

	revokeShare: async ({ params, request }) => {
		const token = field(await request.formData(), 'token');
		await db
			.update(shareLink)
			.set({ revokedAt: new Date() })
			.where(and(eq(shareLink.token, token), eq(shareLink.tripId, params.id)));
	},

	delete: async ({ params }) => {
		await db.delete(trip).where(eq(trip.id, params.id));
		redirect(303, '/');
	}
};
