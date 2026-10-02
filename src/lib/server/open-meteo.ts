import {
	datesInRange,
	forecastToDays,
	planWeather,
	TYPICAL_YEARS,
	typicalDays,
	typicalMonths,
	yearsBefore,
	type DailyRecord,
	type DayWeather,
	type TripWeather
} from '#lib/climate.ts';
import { describeWeatherCode, parseDailyForecast } from '#lib/weather.ts';
import type { WhenWindow } from '#lib/when.ts';

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

const DAILY_FORECAST =
	'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max';
const DAILY_HISTORY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum';

// Forecasts change through the day; past weather never does.
const FORECAST_TTL_MS = 60 * 60 * 1000;
const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { expires: number; body: unknown }>();

async function getJson(url: URL, ttlMs: number, fetcher: typeof fetch): Promise<unknown | null> {
	const key = url.toString();
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.body;
	try {
		const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!res.ok) return null;
		const body = await res.json();
		cache.set(key, { expires: Date.now() + ttlMs, body });
		if (cache.size > 500) cache.delete(cache.keys().next().value!);
		return body;
	} catch {
		return null;
	}
}

function dailyUrl(
	base: 'forecast' | 'archive',
	latitude: number,
	longitude: number,
	[start, end]: [string, string]
): URL {
	const url = new URL(
		base === 'forecast'
			? 'https://api.open-meteo.com/v1/forecast'
			: 'https://archive-api.open-meteo.com/v1/archive'
	);
	url.searchParams.set('latitude', latitude.toFixed(2));
	url.searchParams.set('longitude', longitude.toFixed(2));
	url.searchParams.set('daily', base === 'forecast' ? DAILY_FORECAST : DAILY_HISTORY);
	url.searchParams.set('timezone', 'auto');
	url.searchParams.set('start_date', start);
	url.searchParams.set('end_date', end);
	return url;
}

interface HistoryDaily {
	time: string[];
	weather_code: (number | null)[];
	temperature_2m_max: (number | null)[];
	temperature_2m_min: (number | null)[];
	precipitation_sum: (number | null)[];
}

async function getHistory(
	latitude: number,
	longitude: number,
	range: [string, string],
	fetcher: typeof fetch
): Promise<HistoryDaily | null> {
	const body = (await getJson(
		dailyUrl('archive', latitude, longitude, range),
		HISTORY_TTL_MS,
		fetcher
	)) as { daily?: HistoryDaily } | null;
	return body?.daily ?? null;
}

function toRecords(daily: HistoryDaily): DailyRecord[] {
	return daily.time.map((date, i) => ({
		date,
		maxC: daily.temperature_2m_max[i],
		minC: daily.temperature_2m_min[i],
		precipitationMm: daily.precipitation_sum[i]
	}));
}

/** The past years' records for the same calendar dates (or months) as `range`. */
async function pastYears(
	latitude: number,
	longitude: number,
	range: [string, string],
	fetcher: typeof fetch
): Promise<DailyRecord[]> {
	const years = await Promise.all(
		Array.from({ length: TYPICAL_YEARS }, (_, i) =>
			getHistory(
				latitude,
				longitude,
				[yearsBefore(range[0], i + 1), yearsBefore(range[1], i + 1)],
				fetcher
			)
		)
	);
	return years.flatMap((d) => (d ? toRecords(d) : []));
}

/**
 * Weather that fits the trip's dates: a forecast when they're close, recorded weather for
 * past trips, and past-year averages for dates beyond the forecast or month/quarter plans.
 */
export async function getTripWeather(
	latitude: number,
	longitude: number,
	window: WhenWindow,
	today = new Date().toISOString().slice(0, 10),
	fetcher = fetch
): Promise<TripWeather> {
	const plan = planWeather(window, today);
	const unavailable: TripWeather = { kind: 'unavailable', title: plan.title };

	if (plan.months) {
		const first = plan.months[0];
		const last = plan.months.at(-1)!;
		const lastDay = new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5)), 0))
			.toISOString()
			.slice(0, 10);
		const records = await pastYears(latitude, longitude, [`${first}-01`, lastDay], fetcher);
		const months = typicalMonths(plan.months, records);
		return months.length > 0
			? { kind: 'months', title: plan.title, note: plan.note ?? '', months }
			: unavailable;
	}

	const days: DayWeather[] = [];
	if (plan.recorded) {
		const daily = await getHistory(latitude, longitude, plan.recorded, fetcher);
		if (daily) {
			for (const [i, date] of daily.time.entries()) {
				const code = daily.weather_code[i];
				const max = daily.temperature_2m_max[i];
				const min = daily.temperature_2m_min[i];
				if (code === null || max === null || min === null) continue;
				days.push({
					date,
					maxC: Math.round(max),
					minC: Math.round(min),
					rainChance: null,
					...describeWeatherCode(code),
					typical: false
				});
			}
		}
	}
	if (plan.forecast) {
		const body = (await getJson(
			dailyUrl('forecast', latitude, longitude, plan.forecast),
			FORECAST_TTL_MS,
			fetcher
		)) as { daily?: Parameters<typeof parseDailyForecast>[0] } | null;
		if (body?.daily) days.push(...forecastToDays(parseDailyForecast(body.daily)));
	}
	if (plan.typical) {
		const records = await pastYears(latitude, longitude, plan.typical, fetcher);
		const history = new Map(records.map((r) => [r.date, r]));
		days.push(...typicalDays(datesInRange(...plan.typical), history));
	}

	return days.length > 0 ? { kind: 'days', title: plan.title, note: plan.note, days } : unavailable;
}
