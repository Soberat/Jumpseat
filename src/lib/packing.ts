import type { TripWeather } from './climate.ts';

/** What a non-revenue standby traveller can't do without. */
export const STANDBY_ESSENTIALS = [
	'Staff ID / company badge',
	'Passport or ID card',
	'ID ticket confirmation (screenshot, works offline)',
	'Dress code: smart casual outfit for the flight',
	'Carry-on only (checked bags can get offloaded)',
	'Phone charger and power bank',
	'Backup flight options noted down',
	'Fallback hotel near the airport saved',
	'Snacks and an empty water bottle',
	'Change of clothes in the carry-on'
];

export const BASICS = [
	'Toiletries',
	'Medication',
	'Underwear and socks',
	'Sleepwear',
	'Travel adapter',
	'Headphones',
	'Payment card and some local cash'
];

/** Items the trip's weather calls for, with the reason shown next to each. */
export function weatherSuggestions(weather: TripWeather | null): { label: string; why: string }[] {
	if (!weather || weather.kind === 'unavailable') return [];

	const highs =
		weather.kind === 'days' ? weather.days.map((d) => d.maxC) : weather.months.map((m) => m.maxC);
	const lows =
		weather.kind === 'days' ? weather.days.map((d) => d.minC) : weather.months.map((m) => m.minC);
	const wet =
		weather.kind === 'days'
			? weather.days.some((d) => (d.rainChance ?? 0) >= 40)
			: weather.months.some((m) => m.rainyDays / m.daysInMonth >= 0.3);

	const hottest = Math.max(...highs);
	const coldest = Math.min(...lows);
	const out: { label: string; why: string }[] = [];
	if (wet) out.push({ label: 'Umbrella or rain jacket', why: 'rain is likely' });
	if (coldest <= 0)
		out.push({ label: 'Winter coat, hat and gloves', why: `lows of ${Math.round(coldest)}°` });
	else if (coldest <= 10)
		out.push({ label: 'Warm jacket', why: `lows of ${Math.round(coldest)}°` });
	if (hottest >= 25) {
		out.push({ label: 'Sunscreen', why: `highs of ${Math.round(hottest)}°` });
		out.push({ label: 'Sunglasses and a hat', why: `highs of ${Math.round(hottest)}°` });
	}
	if (hottest >= 22) out.push({ label: 'Swimwear', why: 'warm enough for a swim' });
	return out;
}
