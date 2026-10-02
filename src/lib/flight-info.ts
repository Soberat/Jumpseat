/** Flight details from a schedule lookup (AeroDataBox), reduced to what a trip needs. */
export interface FlightInfo {
	flightNumber: string;
	airline: string | null;
	origin: string;
	destination: string;
	originName: string | null;
	destinationName: string | null;
	departureDate: string;
	/** Local time at the departure airport. */
	departureTime: string;
	/** Local date and time at the arrival airport. */
	arrivalDate: string | null;
	arrivalTime: string | null;
	/** Gate to gate, from the UTC times. */
	durationMinutes: number | null;
	aircraft: string | null;
	terminal: string | null;
}

interface Movement {
	airport?: { iata?: string; shortName?: string; municipalityName?: string; name?: string };
	scheduledTime?: { local?: string; utc?: string };
	scheduledTimeLocal?: string;
	scheduledTimeUtc?: string;
	terminal?: string;
}
interface RawFlight {
	number?: string;
	departure?: Movement;
	arrival?: Movement;
	airline?: { name?: string };
	aircraft?: { model?: string };
	codeshareStatus?: string;
}

// "2026-11-05 09:40+01:00" → date and time as written (local to that airport).
const LOCAL_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/;
const utcMs = (s: string | undefined) => {
	if (!s) return null;
	const ms = Date.parse(s.replace(' ', 'T').replace(/Z?$/, 'Z'));
	return Number.isNaN(ms) ? null : ms;
};

/** Normalises an AeroDataBox flights/number response; operated flights first. */
export function parseFlights(body: unknown): FlightInfo[] {
	if (!Array.isArray(body)) return [];
	const out: FlightInfo[] = [];
	const sorted = [...(body as RawFlight[])].sort(
		(a, b) =>
			Number(b.codeshareStatus === 'IsOperator') - Number(a.codeshareStatus === 'IsOperator')
	);
	for (const f of sorted) {
		const dep = f.departure;
		const arr = f.arrival;
		const depLocal = (dep?.scheduledTime?.local ?? dep?.scheduledTimeLocal ?? '').match(LOCAL_RE);
		const arrLocal = (arr?.scheduledTime?.local ?? arr?.scheduledTimeLocal ?? '').match(LOCAL_RE);
		const origin = dep?.airport?.iata;
		const destination = arr?.airport?.iata;
		if (!depLocal || !origin || !destination) continue;
		const a = utcMs(dep?.scheduledTime?.utc ?? dep?.scheduledTimeUtc);
		const b = utcMs(arr?.scheduledTime?.utc ?? arr?.scheduledTimeUtc);
		const info: FlightInfo = {
			flightNumber: (f.number ?? '').replace(/\s+/g, ''),
			airline: f.airline?.name ?? null,
			origin,
			destination,
			originName: dep?.airport?.municipalityName ?? dep?.airport?.shortName ?? null,
			destinationName: arr?.airport?.municipalityName ?? arr?.airport?.shortName ?? null,
			departureDate: depLocal[1],
			departureTime: depLocal[2],
			arrivalDate: arrLocal?.[1] ?? null,
			arrivalTime: arrLocal?.[2] ?? null,
			durationMinutes: a !== null && b !== null && b > a ? Math.round((b - a) / 60000) : null,
			aircraft: f.aircraft?.model ?? null,
			terminal: dep?.terminal ?? null
		};
		// The same leg can be listed once per codeshare; keep the first.
		if (!out.some((o) => o.origin === info.origin && o.destination === info.destination)) {
			out.push(info);
		}
	}
	return out;
}

/** "LH 1166", "lh1166" → "LH1166"; null if it doesn't look like a flight number. */
export function normaliseFlightNumber(input: string): string | null {
	const s = input.toUpperCase().replace(/\s+/g, '');
	return /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(s) ? s : null;
}

/** Links to compare fares for a one-way flight; there is no free fares API to ask directly. */
export function priceLinks(origin: string, destination: string, date: string) {
	const [y, m, d] = date.split('-');
	return {
		google: `https://www.google.com/travel/flights?hl=en&curr=PLN&q=${encodeURIComponent(
			`one way flights from ${origin} to ${destination} on ${date}`
		)}`,
		skyscanner: `https://www.skyscanner.pl/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${y.slice(2)}${m}${d}/?adultsv2=1&currency=PLN`
	};
}
