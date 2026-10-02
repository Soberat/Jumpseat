import { error } from '@sveltejs/kit';
import { journeyActions, journeyData, sharedTrip } from '#lib/server/journey.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const link = await sharedTrip(params.token);
	setHeaders({ 'x-robots-tag': 'noindex', 'cache-control': 'private, no-store' });
	return {
		...(await journeyData(link.tripId, link.canEdit ? 'edit' : 'view')),
		editable: link.canEdit,
		backHref: `/s/${params.token}`
	};
};

/** Only editable links may change the plan. */
async function editableTrip({ params }: RequestEvent) {
	const link = await sharedTrip(params.token);
	if (!link.canEdit) error(403, 'This link is view only.');
	return link.tripId;
}

export const actions: Actions = {
	place: async (event) => journeyActions.place(await editableTrip(event), event.request),
	edit: async (event) => journeyActions.edit(await editableTrip(event), event.request),
	addIdea: async (event) => journeyActions.addIdea(await editableTrip(event), event.request)
};
