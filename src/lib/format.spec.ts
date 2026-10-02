import { describe, expect, it } from 'vitest';
import { placeAndWhen } from './format';

describe('placeAndWhen', () => {
	it('joins the place with a description of when', () => {
		expect(
			placeAndWhen('Lisbon', {
				startDate: '2026-10-03',
				endDate: '2026-10-07',
				plannedPeriod: null
			})
		).toBe('Lisbon · 3 – 7 Oct 2026');
		expect(placeAndWhen('Oslo', { startDate: null, endDate: null, plannedPeriod: null })).toBe(
			'Oslo · Dates not set'
		);
	});
});
