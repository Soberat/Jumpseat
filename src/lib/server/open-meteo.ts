import { parseDailyForecast, type DailyForecast } from '#lib/weather.ts';

// Keep pages snappy when the API is slow or unreachable.
const TIMEOUT_MS = 4000;

export interface Place {
	name: string;
	country: string | null;
	latitude: number;
	longitude: number;
	timezone: string | null;
}

/** Resolves a place name to coordinates with the free Open-Meteo geocoding API (no key needed). */
export async function geocode(name: string, fetcher = fetch): Promise<Place | null> {
	const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
	url.searchParams.set('name', name);
	url.searchParams.set('count', '1');
	url.searchParams.set('format', 'json');

	const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) return null;
	const body = await res.json();
	const hit = body.results?.[0];
	if (!hit) return null;
	return {
		name: hit.name,
		country: hit.country ?? null,
		latitude: hit.latitude,
		longitude: hit.longitude,
		timezone: hit.timezone ?? null
	};
}

/** Fetches a daily forecast (up to 16 days) for a location. Returns null if the API is unreachable. */
export async function getForecast(
	latitude: number,
	longitude: number,
	days = 7,
	fetcher = fetch
): Promise<DailyForecast[] | null> {
	const url = new URL('https://api.open-meteo.com/v1/forecast');
	url.searchParams.set('latitude', String(latitude));
	url.searchParams.set('longitude', String(longitude));
	url.searchParams.set(
		'daily',
		'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
	);
	url.searchParams.set('timezone', 'auto');
	url.searchParams.set('forecast_days', String(Math.min(Math.max(days, 1), 16)));

	try {
		const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) return null;
		const body = await res.json();
		return parseDailyForecast(body.daily);
	} catch {
		return null;
	}
}
