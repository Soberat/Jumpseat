import { AERODATABOX_API_KEY } from '$app/env/private';
import { parseFlights, type FlightInfo } from '#lib/flight-info.ts';

const HOST = 'aerodatabox.p.rapidapi.com';
const TIMEOUT_MS = 8000;
// Schedules rarely change; the free tier has a small monthly quota, so cache for a day.
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; flights: FlightInfo[] }>();

export const flightLookupEnabled = () => Boolean(AERODATABOX_API_KEY);

/** Scheduled legs for a flight number on a (local departure) date. */
export async function lookupFlight(
	flightNumber: string,
	date: string,
	fetcher = fetch
): Promise<FlightInfo[]> {
	if (!AERODATABOX_API_KEY) return [];
	const key = `${flightNumber}/${date}`;
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.flights;

	const url = `https://${HOST}/flights/number/${encodeURIComponent(flightNumber)}/${date}?withAircraftImage=false&withLocation=false`;
	const res = await fetcher(url, {
		headers: { 'x-rapidapi-key': AERODATABOX_API_KEY, 'x-rapidapi-host': HOST },
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	// 204/404: no such flight that day.
	if (res.status === 204 || res.status === 404) return [];
	if (!res.ok) throw new Error(`Flight lookup failed (${res.status})`);
	const flights = parseFlights(await res.json());
	cache.set(key, { expires: Date.now() + TTL_MS, flights });
	return flights;
}
