import { airportByCode, airportForPlace, placeCode, type Airport } from './airports.ts';
import { distanceKm, type Point } from './route.ts';

export interface RouteStop extends Point {
	code: string;
	label: string;
}

export interface RouteLeg {
	from: RouteStop;
	to: RouteStop;
	/** True for the "how you'd get there" arc drawn before any flight is added. */
	planned: boolean;
	standby: boolean;
	flightNumber: string | null;
}

export interface TripRoute {
	home: RouteStop;
	destination: RouteStop;
	legs: RouteLeg[];
	distanceKm: number;
}

/** Miro's home airport: every trip starts here unless the trip says otherwise. */
export const DEFAULT_HOME = 'KRK';

const stop = (a: Airport): RouteStop => ({ code: a.code, label: a.city, lat: a.lat, lon: a.lon });

export function tripRoute(
	trip: {
		destination: string;
		latitude: number | null;
		longitude: number | null;
		origin: string | null;
	},
	flights: { origin: string; destination: string; standby: boolean; flightNumber: string }[]
): TripRoute | null {
	const home = stop(airportByCode(trip.origin ?? DEFAULT_HOME) ?? airportByCode(DEFAULT_HOME)!);
	const known = airportForPlace(trip.destination);
	const coords =
		trip.latitude !== null && trip.longitude !== null
			? { lat: trip.latitude, lon: trip.longitude }
			: known;
	if (!coords) return null;

	const legs: RouteLeg[] = [];
	for (const f of flights) {
		const from = airportByCode(f.origin);
		const to = airportByCode(f.destination);
		if (!from || !to) continue;
		legs.push({
			from: stop(from),
			to: stop(to),
			planned: false,
			standby: f.standby,
			flightNumber: f.flightNumber
		});
	}

	// Name the destination after the airport you land at when it's close by.
	const landing = legs
		.map((l) => l.to)
		.find((a) => a.code !== home.code && distanceKm(a, coords) < 150);
	const destination: RouteStop = {
		code: landing?.code ?? known?.code ?? placeCode(trip.destination),
		label: trip.destination.split(',')[0],
		lat: coords.lat,
		lon: coords.lon
	};

	if (legs.length === 0) {
		legs.push({ from: home, to: destination, planned: true, standby: false, flightNumber: null });
	}
	return { home, destination, legs, distanceKm: distanceKm(home, destination) };
}

/**
 * Reads a "starting from" form value: an airport code or a city we know.
 * Empty means the default home airport (null); unknown text is an error.
 */
export function parseOrigin(input: string): { origin: string | null } | { error: string } {
	const value = input.trim();
	if (!value) return { origin: null };
	const airport = airportForPlace(value.split('·')[0].split('—')[0].trim());
	if (!airport)
		return { error: `Couldn't find an airport for "${value}". Try its code, like KRK.` };
	return { origin: airport.code === DEFAULT_HOME ? null : airport.code };
}
