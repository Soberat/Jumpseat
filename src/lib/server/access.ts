import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jumpseat is private to the tailnet. If Tailscale Funnel is switched on, the internet can reach
 * the same port, so requests arriving through Funnel may only see read-only share pages and the
 * static files those pages need.
 *
 * Tailscale marks Funnel traffic with the `Tailscale-Funnel-Request` header and strips any
 * client-supplied copy, so it can be trusted when the app is only reachable through `tailscale serve`.
 */
const PUBLIC_PREFIXES = ['/s/', '/_app/', '/icons/'];
const PUBLIC_FILES = new Set([
	'/manifest.webmanifest',
	'/favicon.svg',
	'/robots.txt',
	'/service-worker.js'
]);

export function isPublicPath(pathname: string): boolean {
	return PUBLIC_FILES.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export function isFunnelRequest(headers: Headers): boolean {
	return headers.has('tailscale-funnel-request');
}

/**
 * With APP_PASSWORD set, internet visitors (through Funnel) can also sign in and use the whole
 * app. People on the tailnet never see a password page. The session cookie is derived from the
 * password, so changing the password signs everyone out.
 */
export const SESSION_COOKIE = 'jumpseat_session';
export const LOGIN_PATH = '/login';

export function sessionToken(password: string): string {
	return createHmac('sha256', password).update('jumpseat-session-v1').digest('base64url');
}

const digest = (s: string) => createHash('sha256').update(s).digest();

export function passwordMatches(given: string, password: string): boolean {
	return password !== '' && timingSafeEqual(digest(given), digest(password));
}

export function validSession(cookie: string | undefined, password: string): boolean {
	return (
		!!cookie && password !== '' && timingSafeEqual(digest(cookie), digest(sessionToken(password)))
	);
}

/** What a request arriving through Funnel gets: the page, a password page first, or a 404. */
export function funnelAccess(
	pathname: string,
	cookie: string | undefined,
	password: string
): 'allow' | 'login' | 'deny' {
	if (isPublicPath(pathname)) return 'allow';
	if (!password) return 'deny';
	if (pathname === LOGIN_PATH || validSession(cookie, password)) return 'allow';
	return 'login';
}

/** Where to go after signing in: only a path on this site, never another one. */
export function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
		? next
		: '/';
}

/** Slows down guessing: at most 10 wrong passwords in 10 minutes, for everyone together. */
const failures: number[] = [];
const WINDOW_MS = 10 * 60 * 1000;
export function tooManyTries(now = Date.now()): boolean {
	while (failures.length && failures[0] < now - WINDOW_MS) failures.shift();
	return failures.length >= 10;
}
export function recordFailure(now = Date.now()): void {
	failures.push(now);
}
