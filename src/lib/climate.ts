import type { DailyForecast } from './weather.ts';
import type { WhenWindow } from './when.ts';

/** One day on the weather strip: a real forecast, or what's typical for that date. */
export interface DayWeather {
	date: string;
	maxC: number;
	minC: number;
	/** Forecast: probability of precipitation. Typical: share of past years with rain that day. */
	rainChance: number | null;
	icon: string;
	summary: string;
	typical: boolean;
}

export interface MonthWeather {
	month: string;
	maxC: number;
	minC: number;
	rainyDays: number;
	daysInMonth: number;
}

export type TripWeather =
	| { kind: 'days'; title: string; note: string | null; days: DayWeather[] }
	| { kind: 'months'; title: string; note: string; months: MonthWeather[] }
	| { kind: 'unavailable'; title: string };

/** Open-Meteo's forecast reaches 16 days ahead, including today. */
export const FORECAST_DAYS = 16;
/** How many past years "typical" weather averages over. */
export const TYPICAL_YEARS = 3;
/** Longest stretch shown day by day. */
export const MAX_DAYS = 21;

export function addDays(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
	return Math.round(
		(Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000
	);
}

/** The same calendar day `years` years earlier (29 Feb becomes 28 Feb). */
export function yearsBefore(date: string, years: number): string {
	const y = Number(date.slice(0, 4)) - years;
	const md = date.slice(5) === '02-29' ? '02-28' : date.slice(5);
	return `${y}-${md}`;
}

export function datesInRange(start: string, end: string): string[] {
	const out: string[] = [];
	for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
	return out;
}

export interface WeatherPlan {
	title: string;
	note: string | null;
	/** Dates to fetch a real forecast for. */
	forecast: [start: string, end: string] | null;
	/** Dates beyond the forecast horizon, shown as typical weather from past years. */
	typical: [start: string, end: string] | null;
	/** Months to summarise from past years, for trips with only a month or quarter. */
	months: string[] | null;
	/** Past trips older than the forecast API reaches back: recorded weather from the archive. */
	recorded?: [start: string, end: string];
}

/** The forecast API also returns recent past days; older ones come from the archive. */
export const FORECAST_PAST_DAYS = 80;

/** Decides which weather fits a trip's dates, relative to today. */
export function planWeather(window: WhenWindow, today: string): WeatherPlan {
	const horizon = addDays(today, FORECAST_DAYS - 1);

	if (window.type === 'none') {
		return {
			title: 'Next 7 days',
			note: null,
			forecast: [today, addDays(today, 6)],
			typical: null,
			months: null
		};
	}
	if (window.type === 'period') {
		return {
			title: 'Typical weather',
			note: `Averages from the last ${TYPICAL_YEARS} years.`,
			forecast: null,
			typical: null,
			months: window.months
		};
	}

	const start = window.start;
	let end = window.end;
	let note: string | null = null;
	if (daysBetween(start, end) >= MAX_DAYS) {
		end = addDays(start, MAX_DAYS - 1);
		note = `Showing the first ${MAX_DAYS} days.`;
	}

	if (start < addDays(today, -FORECAST_PAST_DAYS)) {
		return {
			title: 'Weather during your trip',
			note,
			forecast: null,
			typical: null,
			months: null,
			// The archive lags a few days behind today.
			recorded: [start, end < addDays(today, -6) ? end : addDays(today, -6)]
		};
	}

	// Past and near-future days get a real forecast (or recorded weather);
	// anything beyond the forecast horizon falls back to what's typical.
	if (start > horizon) {
		return {
			title: 'Typical weather for your dates',
			note: joinNotes(
				`Forecasts start ${FORECAST_DAYS} days ahead. Until then, these are averages from the last ${TYPICAL_YEARS} years.`,
				note
			),
			forecast: null,
			typical: [start, end],
			months: null
		};
	}
	if (end > horizon) {
		return {
			title: 'Weather for your trip',
			note: joinNotes(
				'Days marked "typical" are past-year averages until the forecast reaches them.',
				note
			),
			forecast: [start, horizon],
			typical: [addDays(horizon, 1), end],
			months: null
		};
	}
	return {
		title: 'Weather for your trip',
		note,
		forecast: [start, end],
		typical: null,
		months: null
	};
}

function joinNotes(a: string, b: string | null): string {
	return b ? `${a} ${b}` : a;
}

export interface DailyRecord {
	date: string;
	maxC: number | null;
	minC: number | null;
	precipitationMm: number | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** A rainy day, for climate purposes: at least 1 mm of precipitation. */
const RAINY_MM = 1;

export function typicalIcon(rainChance: number, minC: number): { icon: string; summary: string } {
	if (rainChance >= 60)
		return minC <= 0
			? { icon: '🌨️', summary: 'Often snowy' }
			: { icon: '🌧️', summary: 'Often rainy' };
	if (rainChance >= 30) return { icon: '🌦️', summary: 'Some rain likely' };
	return { icon: '🌤️', summary: 'Usually dry' };
}

/**
 * Averages each trip date over the same calendar day in past years.
 * `history` holds every past-year record fetched, keyed by date.
 */
export function typicalDays(
	dates: string[],
	history: Map<string, DailyRecord>,
	years = TYPICAL_YEARS
): DayWeather[] {
	const out: DayWeather[] = [];
	for (const date of dates) {
		const past = Array.from({ length: years }, (_, i) =>
			history.get(yearsBefore(date, i + 1))
		).filter((r): r is DailyRecord => !!r && r.maxC !== null && r.minC !== null);
		if (past.length === 0) continue;
		const rainChance = Math.round(
			(100 * past.filter((r) => (r.precipitationMm ?? 0) >= RAINY_MM).length) / past.length
		);
		const minC = Math.round(mean(past.map((r) => r.minC!)));
		out.push({
			date,
			maxC: Math.round(mean(past.map((r) => r.maxC!))),
			minC,
			rainChance,
			...typicalIcon(rainChance, minC),
			typical: true
		});
	}
	return out;
}

/** Summarises each month (YYYY-MM) from the same month in past years. */
export function typicalMonths(months: string[], records: DailyRecord[]): MonthWeather[] {
	const out: MonthWeather[] = [];
	for (const month of months) {
		const mm = month.slice(5);
		const rows = records.filter(
			(r) => r.date.slice(5, 7) === mm && r.maxC !== null && r.minC !== null
		);
		if (rows.length === 0) continue;
		const years = new Set(rows.map((r) => r.date.slice(0, 4))).size;
		const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(mm), 0)).getUTCDate();
		out.push({
			month,
			maxC: Math.round(mean(rows.map((r) => r.maxC!))),
			minC: Math.round(mean(rows.map((r) => r.minC!))),
			rainyDays: Math.round(
				rows.filter((r) => (r.precipitationMm ?? 0) >= RAINY_MM).length / years
			),
			daysInMonth
		});
	}
	return out;
}

export function forecastToDays(days: DailyForecast[]): DayWeather[] {
	return days.map((d) => ({
		date: d.date,
		maxC: d.maxC,
		minC: d.minC,
		rainChance: d.precipitationChance,
		icon: d.icon,
		summary: d.summary,
		typical: false
	}));
}

/** Each day's weather by date, for day headers. */
export function weatherByDate(w: TripWeather | null | undefined): Map<string, DayWeather> {
	return new Map(w?.kind === 'days' ? w.days.map((d) => [d.date, d]) : []);
}

/** A rainy day worth flagging when planning: rain more likely than not. */
export const isWet = (d: DayWeather) => (d.rainChance ?? 0) >= 50;

const monthName = (month: string) =>
	new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long' });

/** One line for the top of the trip: "🌤️ 21–24°, rain likely on 2 days", "🌤️ November: highs around 24°". */
export function weatherHeadline(w: TripWeather | null | undefined): string | null {
	if (!w || w.kind === 'unavailable') return null;
	if (w.kind === 'months') {
		const m = w.months[0];
		if (!m) return null;
		const icon = typicalIcon((100 * m.rainyDays) / m.daysInMonth, m.minC).icon;
		return `${icon} ${m.maxC}° by day, ${m.minC}° at night`;
	}
	if (w.days.length === 0) return null;
	const highs = w.days.map((d) => d.maxC);
	const [lo, hi] = [Math.min(...highs), Math.max(...highs)];
	const wet = w.days.filter(isWet).length;
	// The most common icon stands for the trip.
	const counts = new Map<string, number>();
	for (const d of w.days) counts.set(d.icon, (counts.get(d.icon) ?? 0) + 1);
	const icon = [...counts].sort((a, b) => b[1] - a[1])[0][0];
	const temps = lo === hi ? `${hi}°` : `${lo}–${hi}°`;
	return `${icon} ${temps}${wet ? `, rain likely on ${wet} day${wet === 1 ? '' : 's'}` : ', mostly dry'}`;
}

/** The weather as lines for the AI planner, so it can put outdoor plans on the good days. */
export function describeWeatherForPlanner(w: TripWeather | null | undefined): string | null {
	if (!w || w.kind === 'unavailable') return null;
	if (w.kind === 'months') {
		if (w.months.length === 0) return null;
		return [
			'Typical weather (averages from past years; exact dates not set):',
			...w.months.map(
				(m) =>
					`- ${monthName(m.month)}: highs around ${m.maxC}°C, lows around ${m.minC}°C, rain on about ${m.rainyDays} of ${m.daysInMonth} days`
			)
		].join('\n');
	}
	if (w.days.length === 0) return null;
	const forecast = w.days.some((d) => !d.typical);
	return [
		forecast
			? 'Weather forecast for the travel dates (days marked "typical" are averages from past years):'
			: 'Typical weather for the travel dates (averages from past years, not a forecast):',
		...w.days.map(
			(d) =>
				`- ${d.date}: ${d.summary}, ${d.maxC}°C / ${d.minC}°C${d.rainChance !== null ? `, ${d.rainChance}% chance of rain` : ''}${forecast && d.typical ? ' (typical)' : ''}`
		),
		'Put beaches, hikes and viewpoints on the drier, warmer days and indoor plans on wet ones.'
	].join('\n');
}
