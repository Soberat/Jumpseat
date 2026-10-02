import { describe, expect, it } from 'vitest';
import {
	funnelAccess,
	isFunnelRequest,
	isPublicPath,
	passwordMatches,
	recordFailure,
	safeNext,
	sessionToken,
	tooManyTries
} from './access';

describe('isPublicPath', () => {
	it('allows share pages and static assets', () => {
		expect(isPublicPath('/s/abc123')).toBe(true);
		expect(isPublicPath('/_app/immutable/entry/start.js')).toBe(true);
		expect(isPublicPath('/manifest.webmanifest')).toBe(true);
	});

	it('blocks the private app', () => {
		expect(isPublicPath('/')).toBe(false);
		expect(isPublicPath('/trips/123')).toBe(false);
		expect(isPublicPath('/s')).toBe(false);
		expect(isPublicPath('/sabotage')).toBe(false);
	});
});

describe('isFunnelRequest', () => {
	it('detects the Tailscale Funnel header', () => {
		expect(isFunnelRequest(new Headers({ 'Tailscale-Funnel-Request': '?1' }))).toBe(true);
		expect(isFunnelRequest(new Headers())).toBe(false);
	});
});

describe('the password for internet visitors', () => {
	const pw = 'correct horse';

	it('without a password, outsiders only get share pages', () => {
		expect(funnelAccess('/s/abc', undefined, '')).toBe('allow');
		expect(funnelAccess('/', undefined, '')).toBe('deny');
		expect(funnelAccess('/login', undefined, '')).toBe('deny');
	});

	it('with one, they sign in first and then get everything', () => {
		expect(funnelAccess('/trips/1', undefined, pw)).toBe('login');
		expect(funnelAccess('/login', undefined, pw)).toBe('allow');
		expect(funnelAccess('/trips/1', 'forged', pw)).toBe('login');
		expect(funnelAccess('/trips/1', sessionToken(pw), pw)).toBe('allow');
		// A new password signs everyone out.
		expect(funnelAccess('/trips/1', sessionToken(pw), 'new one')).toBe('login');
	});

	it('checks the password and where to go next', () => {
		expect(passwordMatches(pw, pw)).toBe(true);
		expect(passwordMatches('wrong', pw)).toBe(false);
		expect(passwordMatches('', '')).toBe(false);
		expect(safeNext('/trips/1?tab=money')).toBe('/trips/1?tab=money');
		expect(safeNext('//evil.example')).toBe('/');
		expect(safeNext('https://evil.example')).toBe('/');
		expect(safeNext(null)).toBe('/');
	});

	it('locks after ten wrong tries in ten minutes', () => {
		const t = 1_000_000;
		for (let i = 0; i < 10; i++) recordFailure(t);
		expect(tooManyTries(t + 1000)).toBe(true);
		expect(tooManyTries(t + 11 * 60 * 1000)).toBe(false);
	});
});
