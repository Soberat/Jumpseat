import { describe, expect, it } from 'vitest';
import { describeWeatherCode, parseDailyForecast } from './weather';

describe('describeWeatherCode', () => {
	it('maps known WMO codes', () => {
		expect(describeWeatherCode(0)).toEqual({ summary: 'Clear sky', icon: '☀️' });
		expect(describeWeatherCode(95).summary).toBe('Thunderstorm');
	});

	it('falls back for unknown codes', () => {
		expect(describeWeatherCode(42).summary).toBe('Unknown');
	});
});

describe('parseDailyForecast', () => {
	it('zips the daily arrays into rows and rounds temperatures', () => {
		const rows = parseDailyForecast({
			time: ['2026-10-02', '2026-10-03'],
			weather_code: [3, 63],
			temperature_2m_max: [18.6, 15.2],
			temperature_2m_min: [9.4, 8.5],
			precipitation_probability_max: [10, null]
		});

		expect(rows).toEqual([
			{
				date: '2026-10-02',
				code: 3,
				summary: 'Overcast',
				icon: '☁️',
				maxC: 19,
				minC: 9,
				precipitationChance: 10
			},
			{
				date: '2026-10-03',
				code: 63,
				summary: 'Rain',
				icon: '🌧️',
				maxC: 15,
				minC: 9,
				precipitationChance: null
			}
		]);
	});
});
