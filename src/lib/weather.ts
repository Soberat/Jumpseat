export interface DailyForecast {
	date: string;
	code: number;
	summary: string;
	icon: string;
	maxC: number;
	minC: number;
	precipitationChance: number | null;
}

// WMO weather interpretation codes, as used by Open-Meteo.
const WEATHER_CODES: Record<number, [summary: string, icon: string]> = {
	0: ['Clear sky', '☀️'],
	1: ['Mainly clear', '🌤️'],
	2: ['Partly cloudy', '⛅'],
	3: ['Overcast', '☁️'],
	45: ['Fog', '🌫️'],
	48: ['Freezing fog', '🌫️'],
	51: ['Light drizzle', '🌦️'],
	53: ['Drizzle', '🌦️'],
	55: ['Heavy drizzle', '🌧️'],
	56: ['Freezing drizzle', '🌧️'],
	57: ['Freezing drizzle', '🌧️'],
	61: ['Light rain', '🌦️'],
	63: ['Rain', '🌧️'],
	65: ['Heavy rain', '🌧️'],
	66: ['Freezing rain', '🌧️'],
	67: ['Freezing rain', '🌧️'],
	71: ['Light snow', '🌨️'],
	73: ['Snow', '🌨️'],
	75: ['Heavy snow', '❄️'],
	77: ['Snow grains', '🌨️'],
	80: ['Rain showers', '🌦️'],
	81: ['Rain showers', '🌧️'],
	82: ['Violent rain showers', '⛈️'],
	85: ['Snow showers', '🌨️'],
	86: ['Heavy snow showers', '❄️'],
	95: ['Thunderstorm', '⛈️'],
	96: ['Thunderstorm with hail', '⛈️'],
	99: ['Thunderstorm with hail', '⛈️']
};

export function describeWeatherCode(code: number): { summary: string; icon: string } {
	const [summary, icon] = WEATHER_CODES[code] ?? ['Unknown', '❔'];
	return { summary, icon };
}

interface OpenMeteoDaily {
	time: string[];
	weather_code: number[];
	temperature_2m_max: number[];
	temperature_2m_min: number[];
	precipitation_probability_max?: (number | null)[];
}

/** Turns an Open-Meteo `daily` forecast block into one row per day. */
export function parseDailyForecast(daily: OpenMeteoDaily): DailyForecast[] {
	return daily.time.map((date, i) => ({
		date,
		code: daily.weather_code[i],
		...describeWeatherCode(daily.weather_code[i]),
		maxC: Math.round(daily.temperature_2m_max[i]),
		minC: Math.round(daily.temperature_2m_min[i]),
		precipitationChance: daily.precipitation_probability_max?.[i] ?? null
	}));
}
