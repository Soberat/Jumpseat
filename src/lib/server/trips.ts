import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from './db/index.ts';
import { flight, standbyLoad, timelineItem, trip } from './db/schema.ts';
import { guessHome } from '../trip-route.ts';

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

/** Where you usually fly from, judged by the first flight of each trip. */
export async function homeAirport(): Promise<string> {
	const rows = await db
		.select({ tripId: flight.tripId, origin: flight.origin })
		.from(flight)
		.orderBy(asc(flight.departureDate), asc(flight.departureTime));
	const first = new Map<string, string>();
	for (const r of rows) if (!first.has(r.tripId)) first.set(r.tripId, r.origin);
	return guessHome([...first.values()]);
}
