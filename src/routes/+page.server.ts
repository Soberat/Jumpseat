import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { trip } from '#lib/server/db/schema.ts';
import { geocode } from '#lib/server/open-meteo.ts';
import { field } from '#lib/server/trips.ts';
import { parseWhen, whenSortKey } from '#lib/when.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const trips = await db.select().from(trip);
	trips.sort(
		(a, b) =>
			whenSortKey(a).localeCompare(whenSortKey(b)) || a.createdAt.getTime() - b.createdAt.getTime()
	);
	return { trips, today: new Date().toISOString().slice(0, 10) };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const data = await request.formData();
		const title = field(data, 'title');
		const destination = field(data, 'destination');
		if (!title || !destination) {
			return fail(400, { title, destination, error: 'A trip needs a name and a destination.' });
		}
		const when = parseWhen(data);
		if ('error' in when) return fail(400, { title, destination, error: when.error });

		// Weather and attractions need coordinates; a failed lookup just leaves them empty.
		const place = await geocode(destination).catch(() => null);

		const [created] = await db
			.insert(trip)
			.values({
				title,
				destination,
				latitude: place?.latitude ?? null,
				longitude: place?.longitude ?? null,
				timezone: place?.timezone ?? null,
				...when
			})
			.returning({ id: trip.id });

		redirect(303, `/trips/${created.id}`);
	}
};
