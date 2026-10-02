import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { APP_PASSWORD } from '$app/env/private';
import { LOGIN_PATH, SESSION_COOKIE, funnelAccess, isFunnelRequest } from '#lib/server/access.ts';
// Opening the database applies pending migrations; do it at startup, not on the first request.
import '#lib/server/db/index.ts';

export const handle: Handle = async ({ event, resolve }) => {
	if (isFunnelRequest(event.request.headers)) {
		const access = funnelAccess(
			event.url.pathname,
			event.cookies.get(SESSION_COOKIE),
			APP_PASSWORD ?? ''
		);
		if (access === 'deny') error(404, 'Not found');
		if (access === 'login') {
			if (event.request.method !== 'GET') error(401, 'Sign in first');
			redirect(
				303,
				`${LOGIN_PATH}?next=${encodeURIComponent(event.url.pathname + event.url.search)}`
			);
		}
	}
	return resolve(event);
};
