import { describe, expect, it } from 'vitest';
import { placeAndDates } from './format';

describe('placeAndDates', () => {
	it('joins the place with whatever dates exist', () => {
		expect(placeAndDates('Lisbon', null, null)).toBe('Lisbon');
		expect(placeAndDates('Lisbon', '2026-10-10', null)).toBe('Lisbon · 2026-10-10');
		expect(placeAndDates('Lisbon', '2026-10-10', '2026-10-14')).toBe(
			'Lisbon · 2026-10-10 – 2026-10-14'
		);
	});
});
