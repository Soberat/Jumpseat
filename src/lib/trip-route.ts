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

export const DEFAULT_HOME = 'FRA';

const stop = (a: Airport): RouteStop => ({ code: a.code, label: a.city, lat: a.lat, lon: a.lon });

/** The most common origin of the first flight of each trip: where you usually fly from. */
export function guessHome(firstOrigins: string[]): string {
	const counts = new Map<string, number>();
	for (const o of firstOrigins) {
		if (airportByCode(o)) counts.set(o, (counts.get(o) ?? 0) + 1);
	}
	return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? DEFAULT_HOME;
}

export function tripRoute(
	trip: { destination: string; latitude: number | null; longitude: number | null },
	flights: { origin: string; destination: string; standby: boolean; flightNumber: string }[],
	homeCode: string
): TripRoute | null {
	const home = stop(airportByCode(homeCode) ?? airportByCode(DEFAULT_HOME)!);
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
