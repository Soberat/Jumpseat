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
