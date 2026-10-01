import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from './db/index.ts';
import { flight, standbyLoad, trip } from './db/schema.ts';

export async function getTripWithFlights(id: string) {
	const [found] = await db.select().from(trip).where(eq(trip.id, id));
	if (!found) return null;
	const flights = await db
		.select()
		.from(flight)
		.where(eq(flight.tripId, id))
		.orderBy(asc(flight.departureDate), asc(flight.departureTime));
	return { trip: found, flights };
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
