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
	/** Further stops after the destination, in order, for trips that go on (a round-the-world). */
	stops: RouteStop[];
	legs: RouteLeg[];
	distanceKm: number;
}

/** Miro's home airport: every trip starts here unless the trip says otherwise. */
export const DEFAULT_HOME = 'KRK';

const stop = (a: Airport): RouteStop => ({ code: a.code, label: a.city, lat: a.lat, lon: a.lon });

/** A place the trip goes on to after its destination; coordinates come from a lookup. */
export interface TripStop {
	name: string;
	lat: number | null;
	lon: number | null;
}

/** Reads the stored stops column (JSON); anything unreadable is no stops. */
export function readStops(json: string | null | undefined): TripStop[] {
	if (!json) return [];
	try {
		const parsed: unknown = JSON.parse(json);
		return Array.isArray(parsed)
			? parsed.filter((s): s is TripStop => typeof s?.name === 'string' && s.name.trim() !== '')
			: [];
	} catch {
		return [];
	}
}

/** "San Francisco → Sydney → Singapore" */
export function describeStops(destination: string, stops: TripStop[]): string {
	return [destination, ...stops.map((s) => s.name)].join(' → ');
}

const NEAR_KM = 150;

export function tripRoute(
	trip: {
		destination: string;
		latitude: number | null;
		longitude: number | null;
		origin: string | null;
		stops?: string | null;
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
	const place = (name: string, at: Point, known: Airport | null): RouteStop => {
		const landing = legs
			.map((l) => l.to)
			.find((a) => a.code !== home.code && distanceKm(a, at) < NEAR_KM);
		return {
			code: landing?.code ?? known?.code ?? placeCode(name),
			label: name.split(',')[0],
			lat: at.lat,
			lon: at.lon
		};
	};
	// Name the destination after the airport you land at when it's close by.
	const destination = place(trip.destination, coords, known);
	const stops = readStops(trip.stops).flatMap((s) => {
		const airport = airportForPlace(s.name);
		const at = s.lat !== null && s.lon !== null ? { lat: s.lat, lon: s.lon } : airport;
		return at ? [place(s.name, at, airport)] : [];
	});

	if (stops.length === 0) {
		if (legs.length === 0) {
			legs.push({ from: home, to: destination, planned: true, standby: false, flightNumber: null });
		}
		return { home, destination, stops, legs, distanceKm: distanceKm(home, destination) };
	}

	// A multi-stop trip: home, each stop in turn, and back home. Hops no flight covers yet
	// are drawn as planned. A hop counts as flown when a flight leaves near its start and
	// one lands near its end, so connections (KRK→FRA→SFO) still count.
	const near = (a: Point, b: Point) => distanceKm(a, b) < NEAR_KM;
	const chain = [home, destination, ...stops, home];
	for (let i = 0; i + 1 < chain.length; i++) {
		const [a, b] = [chain[i], chain[i + 1]];
		const flown = legs.some((l) => near(l.from, a)) && legs.some((l) => near(l.to, b));
		if (!flown) legs.push({ from: a, to: b, planned: true, standby: false, flightNumber: null });
	}
	const total = chain.slice(1).reduce((sum, p, i) => sum + distanceKm(chain[i], p), 0);
	return { home, destination, stops, legs, distanceKm: total };
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
