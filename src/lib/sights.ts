export interface Sight {
	title: string;
	description: string | null;
	url: string;
	thumbnail: string | null;
	distanceKm: number;
	/** Wikipedia page views over the last month: a decent proxy for "worth seeing". */
	popularity: number;
}

// Geosearch returns everything with coordinates. These are rarely what a visitor is after.
const NOT_SIGHTS =
	/\b(station|stop|street|road|avenue|highway|motorway|district|parish|freguesia|neighbou?rhood|borough|ward|municipality|suburb|railway|metro line|school|university faculty|company|bank|hotel|hospital|embassy|consulate|electoral|constituency|football club|sports club|airline|bus route|tram line)\b/i;

interface GeoPage {
	pageid: number;
	title: string;
	description?: string;
	thumbnail?: { source: string };
	coordinates?: { dist: number }[];
	pageviews?: Record<string, number | null>;
}

/** Turns a Wikipedia geosearch response into ranked sights. */
export function parseSights(body: unknown, limit = 12): Sight[] {
	const pages = (body as { query?: { pages?: GeoPage[] } })?.query?.pages ?? [];
	return pages
		.filter((p) => !NOT_SIGHTS.test(`${p.title} ${p.description ?? ''}`))
		.map((p) => ({
			title: p.title,
			description: p.description ?? null,
			url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(' ', '_'))}`,
			thumbnail: p.thumbnail?.source ?? null,
			distanceKm: Math.round((p.coordinates?.[0]?.dist ?? 0) / 100) / 10,
			popularity: Object.values(p.pageviews ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0)
		}))
		.sort((a, b) => b.popularity - a.popularity)
		.slice(0, limit);
}
