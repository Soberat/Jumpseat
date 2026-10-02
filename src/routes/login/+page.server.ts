import { error, fail, redirect } from '@sveltejs/kit';
import { APP_PASSWORD } from '$app/env/private';
import {
	SESSION_COOKIE,
	passwordMatches,
	recordFailure,
	safeNext,
	sessionToken,
	tooManyTries
} from '#lib/server/access.ts';
import type { Actions, PageServerLoad } from './$types';

const password = () => APP_PASSWORD ?? '';

export const load: PageServerLoad = ({ url }) => {
	if (!password()) error(404, 'Not found');
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		if (!password()) error(404, 'Not found');
		if (tooManyTries()) {
			return fail(429, { error: 'Too many wrong tries. Wait a few minutes and try again.' });
		}
		const data = await request.formData();
		if (!passwordMatches(String(data.get('password') ?? ''), password())) {
			recordFailure();
			return fail(400, { error: "That's not the password." });
		}
		cookies.set(SESSION_COOKIE, sessionToken(password()), {
			path: '/',
			httpOnly: true,
			secure: url.protocol === 'https:',
			sameSite: 'lax',
			maxAge: 30 * 24 * 60 * 60
		});
		redirect(303, safeNext(String(data.get('next') ?? '')));
	}
};
