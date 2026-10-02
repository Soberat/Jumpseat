import { distanceKm } from './route.ts';

export interface Sight {
	title: string;
	description: string | null;
	url: string;
	thumbnail: string | null;
	/** From the destination's centre. */
	distanceKm: number;
	/** Wikipedia page views over the last month: a decent proxy for "worth seeing". */
	popularity: number;
}

// Geosearch returns everything with coordinates. These are rarely what a visitor is after.
const NOT_SIGHTS =
	/\b(station|stop|street|road|avenue|highway|motorway|district|parish|freguesia|neighbou?rhood|borough|ward|municipality|suburb|railway|metro line|school|university faculty|company|bank|hotel|hospital|embassy|consulate|electoral|constituency|football club|sports club|airline|bus route|tram line|airport)\b/i;

// Places that are where you are, not something to do there: "Spanish island", "town in Lanzarote",
// "one of the Canary Islands".
const PLACES =
	/^(?:(?:[\w'-]+\s){0,3}(?:city|town|village|hamlet|capital|island|islands|islet|archipelago|province|region|county|country|comarca|locality|settlement|municipality|commune|comune|census-designated place|place|peninsula)\b|one of the\b)/i;

/** "Lanzarote", "Lanzarote, Spain", "Lanzarote (Canary Islands)" all name the same place. */
const bare = (s: string) =>
	s
		.toLowerCase()
		.replace(/\s*\(.*\)\s*$/, '')
		.split(',')[0]
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.trim();

interface GeoPage {
	pageid: number;
	title: string;
	description?: string;
	thumbnail?: { source: string };
	coordinates?: { lat?: number; lon?: number; dist?: number }[];
	pageviews?: Record<string, number | null>;
}

/**
 * Turns Wikipedia geosearch responses into ranked sights. Leaves out the destination itself,
 * the towns and municipalities around it, and pages too obscure to have a description.
 */
export function parseSights(
	bodies: unknown | unknown[],
	limit = 12,
	place = '',
	centre: { lat: number; lon: number } | null = null
): Sight[] {
	const byId = new Map<number, GeoPage>();
	for (const body of Array.isArray(bodies) ? bodies : [bodies]) {
		for (const p of (body as { query?: { pages?: GeoPage[] } })?.query?.pages ?? []) {
			byId.set(p.pageid, { ...byId.get(p.pageid), ...p });
		}
	}
	const here = bare(place);
	return [...byId.values()]
		.filter(
			(p) =>
				!!p.description &&
				!NOT_SIGHTS.test(`${p.title} ${p.description}`) &&
				!PLACES.test(p.description) &&
				bare(p.title) !== here
		)
		.map((p) => {
			const c = p.coordinates?.[0];
			const km =
				centre && c?.lat !== undefined && c.lon !== undefined
					? distanceKm(centre, { lat: c.lat, lon: c.lon })
					: Math.round((c?.dist ?? 0) / 100) / 10;
			return {
				title: p.title,
				description: p.description ?? null,
				url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replaceAll(' ', '_'))}`,
				thumbnail: p.thumbnail?.source ?? null,
				distanceKm: km,
				popularity: Object.values(p.pageviews ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0)
			};
		})
		.sort((a, b) => b.popularity - a.popularity)
		.slice(0, limit);
}
