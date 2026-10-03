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
	/\b(station|stop|street|road|avenue|highway|motorway|district|parish|freguesia|neighbou?rhood|borough|ward|municipality|suburb|railway|metro line|school|university faculty|company|bank|hotel|hospital|embassy|consulate|electoral|constituency|football club|sports club|airline|bus route|tram line|airport|earthquakes?|accidents?|crash(?:es)?|disasters?|massacres?|riots?|shootings?|bombings?|murders?|assassinations?|incidents?|hurricanes?|floods?|epidemics?|outbreaks?|trials?|elections?|battle of|siege|sex club|strip club|nightclub|brothel)\b/i;

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

export interface GeoPage {
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

/** A place from OpenStreetMap that might be worth a visit, before Wikipedia has said how popular it is. */
export interface Candidate {
	name: string;
	lat: number;
	lon: number;
	/** English Wikipedia title, when OpenStreetMap tags one. */
	title: string | null;
	/** Wikidata id (Q…), which lets us find the English title when the tag is in another language. */
	wikidata: string | null;
	/** OpenStreetMap's own kind, e.g. "museum" or "castle", for a first rough ordering. */
	kind: string;
}

interface OsmElement {
	type?: string;
	id?: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	tags?: Record<string, string>;
}

// Kinds that are worth a trip, roughly from most to least; used only to choose which places to look up.
const KIND_WEIGHT: Record<string, number> = {
	attraction: 5,
	museum: 5,
	castle: 5,
	viewpoint: 4,
	zoo: 4,
	aquarium: 4,
	theme_park: 4,
	volcano: 5,
	beach: 4,
	peak: 3,
	cave_entrance: 4,
	nature_reserve: 4,
	park: 3,
	garden: 4,
	palace: 5,
	fort: 4,
	monument: 3,
	ruins: 4,
	archaeological_site: 4,
	cathedral: 4,
	lighthouse: 3,
	tower: 3,
	bridge: 2,
	gallery: 3,
	memorial: 2,
	church: 2,
	theatre: 3,
	city_gate: 2,
	artwork: 1,
	island: 3,
	islet: 2
};

/**
 * The Overpass query: named places with a Wikidata entry (so someone cared enough to document
 * them), with `qt` output; a wide search over everything overran the public server's time limit. `wide` (islands and regions, whose sights are far
 * apart) drops the commonest, least interesting kinds to keep the search light.
 */
export function overpassQuery(lat: number, lon: number, radiusM: number, wide = false): string {
	const around = `(around:${radiusM},${lat},${lon})`;
	const kinds: [string, string][] = [
		['tourism', 'attraction|museum|gallery|zoo|aquarium|theme_park|viewpoint'],
		['historic', 'castle|fort|monument|memorial|ruins|archaeological_site|city_gate|palace|tower'],
		['natural', 'beach|peak|volcano|cave_entrance|hot_spring'],
		['place', 'island|islet'],
		...(wide
			? []
			: ([
					['leisure', 'park|garden|nature_reserve'],
					['building', 'cathedral|castle|palace'],
					['man_made', 'lighthouse|tower|bridge']
				] as [string, string][]))
	];
	// Relations too, but only here: big parks and bridges are often mapped as one.
	const parts = kinds.flatMap(([k, v]) =>
		['node', 'way', 'relation'].map((t) => `${t}${around}["name"]["wikidata"]["${k}"~"^(${v})$"];`)
	);
	return `[out:json][timeout:30];(${parts.join('')});out center qt tags 500;`;
}

/** True when Overpass gave up part-way ("Query timed out") and the answer is only some of the places. */
export function overpassPartial(body: unknown): boolean {
	const remark = (body as { remark?: string })?.remark;
	return !!remark && /runtime error|timed out|out of memory/i.test(remark);
}

/** Candidates from an Overpass answer, one per Wikidata entry, nearest copy first. */
export function parseOverpass(body: unknown): Candidate[] {
	const elements = (body as { elements?: OsmElement[] })?.elements ?? [];
	const byId = new Map<string, Candidate>();
	for (const e of elements) {
		const t = e.tags ?? {};
		const lat = e.lat ?? e.center?.lat;
		const lon = e.lon ?? e.center?.lon;
		const name = t['name:en'] ?? t.name;
		if (!name || lat === undefined || lon === undefined || !/^Q\d+$/.test(t.wikidata ?? ''))
			continue;
		const kind =
			[t.tourism, t.historic, t.natural, t.building, t.leisure, t.man_made, t.place].find(
				(k) => k && KIND_WEIGHT[k] !== undefined
			) ?? 'other';
		const en = /^en:(.+)$/.exec(t.wikipedia ?? '')?.[1] ?? null;
		const prev = byId.get(t.wikidata);
		// A place can be several OpenStreetMap objects (a park and its gate): keep the best one.
		if (prev && (KIND_WEIGHT[prev.kind] ?? 0) >= (KIND_WEIGHT[kind] ?? 0)) continue;
		byId.set(t.wikidata, { name, lat, lon, title: en, wikidata: t.wikidata, kind });
	}
	return [...byId.values()];
}

/** The most promising candidates to look up: a good kind of place, and already tied to an English article. */
export function shortlist(candidates: Candidate[], limit = 100): Candidate[] {
	const score = (c: Candidate) => (KIND_WEIGHT[c.kind] ?? 0) + (c.title ? 1 : 0);
	return candidates.toSorted((a, b) => score(b) - score(a)).slice(0, limit);
}

/** A sight from what Wikipedia says about it. Null when it isn't a place to visit. */
export function toSight(
	c: Candidate,
	page: GeoPage,
	centre: { lat: number; lon: number },
	place = ''
): Sight | null {
	const description = page.description ?? null;
	// Already a kind of place people visit (an island fort, a park), so unlike geosearch results
	// a description like "Island in San Francisco Bay" is fine; only events and the like go.
	if (NOT_SIGHTS.test(`${page.title} ${description ?? ''}`) || bare(page.title) === bare(place)) {
		return null;
	}
	return {
		title: page.title,
		description,
		url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
		thumbnail: page.thumbnail?.source ?? null,
		distanceKm: distanceKm(centre, c),
		popularity: Object.values(page.pageviews ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0)
	};
}

/**
 * Most-read first, but closer wins when readership is similar: a famous bridge across the bay
 * beats a famous one two hours away.
 */
export function rankSights(sights: Sight[], limit = 16): Sight[] {
	const score = (s: Sight) => s.popularity / (1 + s.distanceKm / 25);
	return sights.toSorted((a, b) => score(b) - score(a)).slice(0, limit);
}

/** The same place from two sources: keep the first. */
export function uniqueSights(sights: Sight[]): Sight[] {
	const seen = new Set<string>();
	return sights.filter((s) => {
		const k = bare(s.title);
		return !seen.has(k) && !!seen.add(k);
	});
}
