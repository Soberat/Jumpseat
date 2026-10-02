import { asc, desc, eq, inArray } from 'drizzle-orm';
import { geocode } from './open-meteo.ts';
import { airportForPlace } from '#lib/airports.ts';
import type { TripStop } from '#lib/trip-route.ts';
import { db } from './db/index.ts';
import { flight, standbyLoad, timelineItem, trip } from './db/schema.ts';

export async function getTripPlan(id: string) {
	const [found] = await db.select().from(trip).where(eq(trip.id, id));
	if (!found) return null;
	const flights = await db
		.select()
		.from(flight)
		.where(eq(flight.tripId, id))
		.orderBy(asc(flight.departureDate), asc(flight.departureTime));
	const items = await db
		.select()
		.from(timelineItem)
		.where(eq(timelineItem.tripId, id))
		.orderBy(asc(timelineItem.createdAt));
	return { trip: found, flights, items };
}

export async function getLoadsForFlights(flightIds: string[]) {
	if (flightIds.length === 0) return [];
	return db
		.select()
		.from(standbyLoad)
		.where(inArray(standbyLoad.flightId, flightIds))
		.orderBy(desc(standbyLoad.recordedAt));
}

/** Reads a required, trimmed text field from a form. */
export function field(data: FormData, name: string): string {
	return String(data.get(name) ?? '').trim();
}

/** Reads an optional text field, turning empty strings into null. */
export function optionalField(data: FormData, name: string): string | null {
	return field(data, name) || null;
}

/**
 * Reads the "then on to" stops of a trip form and finds where they are: a known
 * airport city first, otherwise a lookup. Returns the JSON for the stops column.
 */
export async function resolveStops(
	data: FormData,
	previous: TripStop[] = []
): Promise<string | null> {
	const names = data
		.getAll('stop')
		.map((v) => String(v).trim())
		.filter(Boolean)
		.slice(0, 12);
	if (names.length === 0) return null;
	const stops = await Promise.all(
		names.map(async (name): Promise<TripStop> => {
			const old = previous.find((p) => p.name === name && p.lat !== null);
			if (old) return old;
			const airport = airportForPlace(name);
			if (airport) return { name, lat: airport.lat, lon: airport.lon };
			const place = await geocode(name).catch(() => null);
			return { name, lat: place?.latitude ?? null, lon: place?.longitude ?? null };
		})
	);
	return JSON.stringify(stops);
}
