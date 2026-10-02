/**
 * Major airports, for drawing routes. Coordinates are rounded: they place a
 * dot on the map, nothing more. Cities double as a lookup from a trip's
 * destination name to a code.
 */
export interface Airport {
	code: string;
	city: string;
	lat: number;
	lon: number;
}

// prettier-ignore
const LIST: [string, string, number, number][] = [
	['FRA', 'Frankfurt', 50.03, 8.57], ['MUC', 'Munich', 48.35, 11.79], ['BER', 'Berlin', 52.37, 13.5],
	['HAM', 'Hamburg', 53.63, 9.99], ['DUS', 'Düsseldorf', 51.29, 6.77], ['CGN', 'Cologne', 50.87, 7.14],
	['STR', 'Stuttgart', 48.69, 9.22], ['HAJ', 'Hanover', 52.46, 9.69], ['NUE', 'Nuremberg', 49.5, 11.07],
	['LEJ', 'Leipzig', 51.42, 12.24], ['BRE', 'Bremen', 53.05, 8.79], ['DRS', 'Dresden', 51.13, 13.77],
	['VIE', 'Vienna', 48.11, 16.57], ['ZRH', 'Zurich', 47.46, 8.55], ['GVA', 'Geneva', 46.24, 6.11],
	['BRU', 'Brussels', 50.9, 4.48], ['AMS', 'Amsterdam', 52.31, 4.76], ['LHR', 'London', 51.47, -0.45],
	['LGW', 'London Gatwick', 51.15, -0.19], ['MAN', 'Manchester', 53.36, -2.27], ['EDI', 'Edinburgh', 55.95, -3.37],
	['DUB', 'Dublin', 53.42, -6.27], ['CDG', 'Paris', 49.01, 2.55], ['NCE', 'Nice', 43.66, 7.21],
	['LYS', 'Lyon', 45.73, 5.08], ['MRS', 'Marseille', 43.44, 5.22], ['BCN', 'Barcelona', 41.3, 2.08],
	['MAD', 'Madrid', 40.47, -3.56], ['AGP', 'Málaga', 36.67, -4.5], ['PMI', 'Palma de Mallorca', 39.55, 2.74],
	['SVQ', 'Seville', 37.42, -5.9], ['VLC', 'Valencia', 39.49, -0.48], ['IBZ', 'Ibiza', 38.87, 1.37],
	['TFS', 'Tenerife', 28.04, -16.57], ['LPA', 'Gran Canaria', 27.93, -15.39], ['LIS', 'Lisbon', 38.77, -9.13],
	['OPO', 'Porto', 41.24, -8.68], ['FAO', 'Faro', 37.01, -7.97], ['FCO', 'Rome', 41.8, 12.25],
	['MXP', 'Milan', 45.63, 8.72], ['VCE', 'Venice', 45.5, 12.35], ['NAP', 'Naples', 40.88, 14.29],
	['FLR', 'Florence', 43.81, 11.2], ['BLQ', 'Bologna', 44.53, 11.29], ['CTA', 'Catania', 37.47, 15.07],
	['PMO', 'Palermo', 38.18, 13.1], ['CPH', 'Copenhagen', 55.62, 12.65], ['OSL', 'Oslo', 60.19, 11.1],
	['ARN', 'Stockholm', 59.65, 17.92], ['HEL', 'Helsinki', 60.32, 24.96], ['KEF', 'Reykjavik', 63.99, -22.62],
	['WAW', 'Warsaw', 52.17, 20.97], ['KRK', 'Krakow', 50.08, 19.78], ['GDN', 'Gdansk', 54.38, 18.47],
	['WRO', 'Wroclaw', 51.1, 16.89], ['PRG', 'Prague', 50.1, 14.26], ['BUD', 'Budapest', 47.44, 19.26],
	['OTP', 'Bucharest', 44.57, 26.09], ['SOF', 'Sofia', 42.7, 23.41], ['ATH', 'Athens', 37.94, 23.94],
	['HER', 'Heraklion', 35.34, 25.18], ['JTR', 'Santorini', 36.4, 25.48], ['RHO', 'Rhodes', 36.41, 28.09],
	['SKG', 'Thessaloniki', 40.52, 22.97], ['DBV', 'Dubrovnik', 42.56, 18.27], ['SPU', 'Split', 43.54, 16.3],
	['ZAG', 'Zagreb', 45.74, 16.07], ['LJU', 'Ljubljana', 46.22, 14.46], ['BEG', 'Belgrade', 44.82, 20.31],
	['IST', 'Istanbul', 41.26, 28.74], ['AYT', 'Antalya', 36.9, 30.8], ['MLA', 'Malta', 35.86, 14.48],
	['LCA', 'Larnaca', 34.88, 33.63], ['TLV', 'Tel Aviv', 32.01, 34.89], ['CAI', 'Cairo', 30.12, 31.41],
	['HRG', 'Hurghada', 27.18, 33.8], ['RAK', 'Marrakesh', 31.6, -8.04], ['CMN', 'Casablanca', 33.37, -7.59],
	['TUN', 'Tunis', 36.85, 10.23], ['DXB', 'Dubai', 25.25, 55.36], ['AUH', 'Abu Dhabi', 24.43, 54.65],
	['DOH', 'Doha', 25.27, 51.61], ['RUH', 'Riyadh', 24.96, 46.7], ['MCT', 'Muscat', 23.59, 58.28],
	['JNB', 'Johannesburg', -26.14, 28.24], ['CPT', 'Cape Town', -33.96, 18.6], ['NBO', 'Nairobi', -1.32, 36.93],
	['ADD', 'Addis Ababa', 8.98, 38.8], ['LOS', 'Lagos', 6.58, 3.32], ['MRU', 'Mauritius', -20.43, 57.68],
	['SEZ', 'Seychelles', -4.67, 55.52], ['ZNZ', 'Zanzibar', -6.22, 39.22], ['DEL', 'Delhi', 28.56, 77.1],
	['BOM', 'Mumbai', 19.09, 72.87], ['BLR', 'Bangalore', 13.2, 77.71], ['MAA', 'Chennai', 12.99, 80.17],
	['MLE', 'Malé', 4.19, 73.53], ['CMB', 'Colombo', 7.18, 79.88], ['BKK', 'Bangkok', 13.69, 100.75],
	['HKT', 'Phuket', 8.11, 98.31], ['SIN', 'Singapore', 1.36, 103.99], ['KUL', 'Kuala Lumpur', 2.75, 101.71],
	['CGK', 'Jakarta', -6.13, 106.66], ['DPS', 'Bali', -8.75, 115.17], ['MNL', 'Manila', 14.51, 121.02],
	['SGN', 'Ho Chi Minh City', 10.82, 106.65], ['HAN', 'Hanoi', 21.22, 105.81], ['HKG', 'Hong Kong', 22.31, 113.92],
	['PEK', 'Beijing', 40.08, 116.6], ['PVG', 'Shanghai', 31.14, 121.81], ['CAN', 'Guangzhou', 23.39, 113.3],
	['TPE', 'Taipei', 25.08, 121.23], ['ICN', 'Seoul', 37.46, 126.44], ['HND', 'Tokyo', 35.55, 139.78],
	['NRT', 'Tokyo Narita', 35.77, 140.39], ['KIX', 'Osaka', 34.43, 135.24], ['SYD', 'Sydney', -33.94, 151.18],
	['MEL', 'Melbourne', -37.67, 144.84], ['BNE', 'Brisbane', -27.38, 153.12], ['PER', 'Perth', -31.94, 115.97],
	['AKL', 'Auckland', -37.01, 174.79], ['JFK', 'New York', 40.64, -73.78], ['EWR', 'Newark', 40.69, -74.17],
	['BOS', 'Boston', 42.36, -71.01], ['IAD', 'Washington', 38.95, -77.46], ['PHL', 'Philadelphia', 39.87, -75.24],
	['ORD', 'Chicago', 41.98, -87.9], ['ATL', 'Atlanta', 33.64, -84.43], ['MIA', 'Miami', 25.79, -80.29],
	['MCO', 'Orlando', 28.43, -81.31], ['DFW', 'Dallas', 32.9, -97.04], ['IAH', 'Houston', 29.99, -95.34],
	['DEN', 'Denver', 39.86, -104.67], ['LAS', 'Las Vegas', 36.08, -115.15], ['LAX', 'Los Angeles', 33.94, -118.41],
	['SFO', 'San Francisco', 37.62, -122.38], ['SEA', 'Seattle', 47.45, -122.31], ['DTW', 'Detroit', 42.21, -83.35],
	['MSP', 'Minneapolis', 44.88, -93.22], ['CLT', 'Charlotte', 35.21, -80.94], ['HNL', 'Honolulu', 21.32, -157.92],
	['YYZ', 'Toronto', 43.68, -79.63], ['YUL', 'Montreal', 45.47, -73.74], ['YVR', 'Vancouver', 49.19, -123.18],
	['YYC', 'Calgary', 51.13, -114.01], ['MEX', 'Mexico City', 19.44, -99.07], ['CUN', 'Cancún', 21.04, -86.87],
	['PTY', 'Panama City', 9.07, -79.38], ['SJO', 'San José', 9.99, -84.2], ['HAV', 'Havana', 22.99, -82.41],
	['PUJ', 'Punta Cana', 18.57, -68.36], ['BOG', 'Bogotá', 4.7, -74.15], ['LIM', 'Lima', -12.02, -77.11],
	['GRU', 'São Paulo', -23.43, -46.47], ['GIG', 'Rio de Janeiro', -22.81, -43.25], ['EZE', 'Buenos Aires', -34.82, -58.54],
	['SCL', 'Santiago', -33.39, -70.79]
];

export const AIRPORTS: Airport[] = LIST.map(([code, city, lat, lon]) => ({ code, city, lat, lon }));
const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

export function airportByCode(code: string): Airport | null {
	return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "Lisbon" → LIS, "Lisbon, Portugal" → LIS, "lis" → LIS. */
export function airportForPlace(place: string): Airport | null {
	const byCode = /^[a-z]{3}$/i.test(place.trim()) ? airportByCode(place) : null;
	if (byCode) return byCode;
	const name = fold(place.split(',')[0]);
	return AIRPORTS.find((a) => fold(a.city) === name) ?? null;
}

/** Three letters for a place, real code when we know one: "Lisbon" → LIS, "Sintra" → SIN… */
export function placeCode(place: string): string {
	return (
		airportForPlace(place)?.code ??
		(fold(place)
			.replace(/[^a-z]/g, '')
			.slice(0, 3)
			.toUpperCase() ||
			'???')
	);
}
