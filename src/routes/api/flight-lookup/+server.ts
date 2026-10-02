import { error, json } from '@sveltejs/kit';
import { normaliseFlightNumber } from '#lib/flight-info.ts';
import { flightLookupEnabled, lookupFlight } from '#lib/server/flight-lookup.ts';
import type { RequestHandler } from './$types';

/** GET ?number=LH1166&date=2026-11-05 → the scheduled legs, for filling in the flight form. */
export const GET: RequestHandler = async ({ url }) => {
	if (!flightLookupEnabled()) error(404, 'Flight lookup is not set up');
	const number = normaliseFlightNumber(url.searchParams.get('number') ?? '');
	const date = url.searchParams.get('date') ?? '';
	if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		error(400, 'Give a flight number and a date');
	}
	try {
		return json({ flights: await lookupFlight(number, date) });
	} catch {
		error(502, 'The flight schedule service did not answer. Try again, or fill it in by hand.');
	}
};
