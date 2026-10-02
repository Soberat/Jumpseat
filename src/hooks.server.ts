import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { isFunnelRequest, isPublicPath } from '#lib/server/access.ts';
// Opening the database applies pending migrations; do it at startup, not on the first request.
import '#lib/server/db/index.ts';

export const handle: Handle = async ({ event, resolve }) => {
	if (isFunnelRequest(event.request.headers) && !isPublicPath(event.url.pathname)) {
		error(404, 'Not found');
	}
	return resolve(event);
};
