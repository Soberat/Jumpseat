import { describe, expect, it } from 'vitest';
import { isFunnelRequest, isPublicPath } from './access';

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
