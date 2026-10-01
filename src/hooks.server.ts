import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { isFunnelRequest, isPublicPath } from '#lib/server/access.ts';

export const handle: Handle = async ({ event, resolve }) => {
	if (isFunnelRequest(event.request.headers) && !isPublicPath(event.url.pathname)) {
		error(404, 'Not found');
	}
	return resolve(event);
};
