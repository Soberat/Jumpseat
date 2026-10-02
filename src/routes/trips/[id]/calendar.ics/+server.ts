import { error } from '@sveltejs/kit';
import { getTripPlan } from '#lib/server/trips.ts';
import { tripCalendar } from '#lib/ics.ts';
import { placeByDay } from '#lib/schedule.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const found = await getTripPlan(params.id);
	if (!found) error(404, 'Trip not found');

	const filename = found.trip.title.replace(/[^\w\- ]+/g, '').trim() || 'trip';
	return new Response(
		tripCalendar(found.trip, found.flights, placeByDay(found.items, found.trip.startDate)),
		{
			headers: {
				'content-type': 'text/calendar; charset=utf-8',
				'content-disposition': `attachment; filename="${filename}.ics"`
			}
		}
	);
};
