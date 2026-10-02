import { journeyActions, journeyData } from '#lib/server/journey.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => journeyData(params.id);

export const actions: Actions = {
	place: ({ params, request }) => journeyActions.place(params.id, request),
	edit: ({ params, request }) => journeyActions.edit(params.id, request),
	addIdea: ({ params, request }) => journeyActions.addIdea(params.id, request)
};
