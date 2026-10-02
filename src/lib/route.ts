import { DOT_NORTH, DOT_STEP, LAND_ROWS } from './world-dots.ts';

export interface Point {
	lat: number;
	lon: number;
}

let dots: Point[] | null = null;

/** Centre of every land cell in the dot matrix. */
export function landDots(): Point[] {
	if (dots) return dots;
	dots = [];
	LAND_ROWS.forEach((row, r) => {
		const lat = DOT_NORTH - r * DOT_STEP;
		[...row].forEach((hex, h) => {
			const bits = parseInt(hex, 16);
			for (let b = 0; b < 4; b++) {
				if (bits & (8 >> b)) dots!.push({ lat, lon: -180 + (h * 4 + b + 0.5) * DOT_STEP });
			}
		});
	});
	return dots;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Points along the shortest path over the globe, longitudes kept continuous (may pass ±180). */
export function greatCircle(a: Point, b: Point, steps = 48): Point[] {
	const [φ1, λ1, φ2, λ2] = [rad(a.lat), rad(a.lon), rad(b.lat), rad(b.lon)];
	const d =
		2 *
		Math.asin(
			Math.sqrt(
				Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
			)
		);
	if (d < 1e-6) return [a, b];
	const out: Point[] = [];
	let prevLon = a.lon;
	for (let i = 0; i <= steps; i++) {
		const f = i / steps;
		const A = Math.sin((1 - f) * d) / Math.sin(d);
		const B = Math.sin(f * d) / Math.sin(d);
		const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
		const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
		const z = A * Math.sin(φ1) + B * Math.sin(φ2);
		let lon = deg(Math.atan2(y, x));
		// Unwrap so the line doesn't jump across the whole map at the date line.
		while (lon - prevLon > 180) lon -= 360;
		while (lon - prevLon < -180) lon += 360;
		prevLon = lon;
		out.push({ lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon });
	}
	return out;
}

/** Distance in km, for "1,847 km" labels. */
export function distanceKm(a: Point, b: Point): number {
	const [φ1, φ2] = [rad(a.lat), rad(b.lat)];
	const h =
		Math.sin((φ2 - φ1) / 2) ** 2 +
		Math.cos(φ1) * Math.cos(φ2) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
	return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

export interface View {
	width: number;
	height: number;
	west: number;
	north: number;
	/** Degrees of longitude per unit of width (latitude is stretched by `ky`). */
	scale: number;
	ky: number;
}

/**
 * Frames the given points in a width × height box: an equirectangular map,
 * squashed by cos(latitude) so mid-latitude places don't look stretched.
 * With `world`, the view is the whole globe cut at that longitude, for routes that go all the way round.
 */
export function frame(
	points: Point[],
	width: number,
	height: number,
	minSpan = 24,
	/** Space kept clear of the route at the top and bottom (for overlaid text). */
	inset = { top: 0, bottom: 0 },
	world: number | null = null
): View {
	const inner = Math.max(height - inset.top - inset.bottom, height * 0.25);
	const lats = points.map((p) => p.lat);
	const lons = points.map((p) => p.lon);
	const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
	const ky = 1 / Math.max(Math.cos(rad(midLat)), 0.35);
	let spanLon =
		world !== null ? 360 : Math.max(Math.max(...lons) - Math.min(...lons), minSpan) * 1.25;
	const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), minSpan / 3) * 1.4;
	// Fit the box's aspect ratio, never showing more than the whole world across.
	if (world === null && spanLon / (spanLat * ky) < width / inner) {
		spanLon = Math.min((spanLat * ky * width) / inner, 360);
	}
	const cLon = world !== null ? world + 180 : (Math.max(...lons) + Math.min(...lons)) / 2;
	// A whole-world map always spans the width exactly, so lines leave one edge and come back at the other.
	const scale = world !== null ? 360 / width : Math.max(spanLon / width, (spanLat * ky) / inner);
	// Centre the route in the space between the insets.
	const cLat = midLat + ((inset.top - inset.bottom) / 2) * (scale / ky);
	return {
		width,
		height,
		west: cLon - (width * scale) / 2,
		north: cLat + (height / 2) * (scale / ky),
		scale,
		ky
	};
}

export function project(p: Point, v: View): [x: number, y: number] {
	return [(p.lon - v.west) / v.scale, ((v.north - p.lat) * v.ky) / v.scale];
}

/** Land dots inside the view (repeated east and west so routes over the date line have land). */
export function dotsInView(v: View): [x: number, y: number][] {
	const out: [number, number][] = [];
	for (const shift of [-360, 0, 360]) {
		for (const d of landDots()) {
			const [x, y] = project({ lat: d.lat, lon: d.lon + shift }, v);
			if (x >= -2 && x <= v.width + 2 && y >= -2 && y <= v.height + 2) out.push([x, y]);
		}
	}
	return out;
}

export function pathFor(points: Point[], v: View): string {
	return points
		.map((p, i) => {
			const [x, y] = project(p, v);
			return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join(' ');
}

/**
 * Where to cut the globe so a route draws in one piece where it can: the middle of
 * the widest stretch of longitude no stop sits in. Kept in (-360, 0] so routes that
 * never need it stay in ordinary -180…180 longitudes.
 */
export function seamFor(points: Point[]): number {
	const lons = [...new Set(points.map((p) => wrapLon(p.lon, -180)))].sort((a, b) => a - b);
	if (lons.length === 0) return -180;
	let widest = -1;
	let seam = lons[0] - 180;
	lons.forEach((a, i) => {
		const b = i + 1 < lons.length ? lons[i + 1] : lons[0] + 360;
		if (b - a > widest) [widest, seam] = [b - a, (a + b) / 2];
	});
	return seam > 0 ? seam - 360 : seam;
}

/** The longitude moved into [seam, seam + 360). */
export function wrapLon(lon: number, seam: number): number {
	return seam + ((((lon - seam) % 360) + 360) % 360);
}

/** A line in seam longitudes, cut into pieces where it crosses the seam. */
export function splitAtSeam(points: Point[], seam: number): Point[][] {
	const pieces: Point[][] = [[]];
	let prev: Point | null = null;
	for (const p of points) {
		const q = { ...p, lon: wrapLon(p.lon, seam) };
		if (prev && Math.abs(q.lon - prev.lon) > 180) pieces.push([]);
		pieces.at(-1)!.push(q);
		prev = q;
	}
	return pieces;
}

type XY = [x: number, y: number];

/**
 * Bows a line drawn in screen space to the left of its direction of travel, like a flight
 * path on a chart. Outbound and return legs bow opposite ways, so they don't draw on top of each other.
 */
export function bow(points: XY[], amount = 0.18, max = 60): XY[] {
	const [x0, y0] = points[0];
	const [x1, y1] = points.at(-1)!;
	const len = Math.hypot(x1 - x0, y1 - y0);
	if (len < 1) return points;
	const lift = Math.min(len * amount, max);
	const [nx, ny] = [(y1 - y0) / len, -(x1 - x0) / len];
	const n = points.length - 1;
	return points.map(([x, y], i) => {
		const k = Math.sin((Math.PI * i) / n) * lift;
		return [x + nx * k, y + ny * k];
	});
}

export interface Label {
	x: number;
	y: number;
	text: string;
	size: number;
	/** Radius of the place's dot. */
	r: number;
	/** Labels that may be left out when there's no room (connections). */
	optional?: boolean;
}

export interface PlacedLabel {
	x: number;
	y: number;
	anchor: 'start' | 'middle' | 'end';
	text: string;
	size: number;
}

/**
 * Puts each label below, above, right or left of its place, whichever first clears the
 * dots and labels already placed. Labels go in the order given, so put the important ones first.
 */
export function placeLabels(
	labels: Label[],
	width: number,
	height: number
): (PlacedLabel | null)[] {
	type Box = [x0: number, y0: number, x1: number, y1: number];
	const taken: Box[] = labels.map((l) => [
		l.x - l.r - 2,
		l.y - l.r - 2,
		l.x + l.r + 2,
		l.y + l.r + 2
	]);
	const hits = (a: Box) =>
		taken.some((b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]);
	return labels.map((l, i) => {
		const w = l.text.length * l.size * 0.62;
		const h = l.size;
		const gap = l.r + 3;
		const options: [PlacedLabel, Box][] = [
			[
				{ x: l.x, y: l.y + gap + h * 0.85, anchor: 'middle', text: l.text, size: l.size },
				[l.x - w / 2, l.y + gap, l.x + w / 2, l.y + gap + h]
			],
			[
				{ x: l.x, y: l.y - gap - h * 0.15, anchor: 'middle', text: l.text, size: l.size },
				[l.x - w / 2, l.y - gap - h, l.x + w / 2, l.y - gap]
			],
			[
				{ x: l.x + gap, y: l.y + h * 0.35, anchor: 'start', text: l.text, size: l.size },
				[l.x + gap, l.y - h / 2, l.x + gap + w, l.y + h / 2]
			],
			[
				{ x: l.x - gap, y: l.y + h * 0.35, anchor: 'end', text: l.text, size: l.size },
				[l.x - gap - w, l.y - h / 2, l.x - gap, l.y + h / 2]
			]
		];
		const own = taken[i];
		taken[i] = [0, 0, 0, 0];
		const inside = ([x0, y0, x1, y1]: Box) => x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height;
		const fit =
			options.find(([, b]) => inside(b) && !hits(b)) ??
			(l.optional ? undefined : (options.find(([, b]) => inside(b)) ?? options[0]));
		taken[i] = own;
		if (!fit) return null;
		const [x0, y0, x1, y1] = fit[1];
		taken.push([x0 - 4, y0 - 2, x1 + 4, y1 + 2]);
		return fit[0];
	});
}
