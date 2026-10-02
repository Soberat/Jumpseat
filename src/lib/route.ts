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
 */
export function frame(
	points: Point[],
	width: number,
	height: number,
	minSpan = 24,
	/** Space kept clear of the route at the top and bottom (for overlaid text). */
	inset = { top: 0, bottom: 0 }
): View {
	const inner = height - inset.top - inset.bottom;
	const lats = points.map((p) => p.lat);
	const lons = points.map((p) => p.lon);
	const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
	const ky = 1 / Math.max(Math.cos(rad(midLat)), 0.35);
	let spanLon = Math.max(Math.max(...lons) - Math.min(...lons), minSpan) * 1.35;
	let spanLat = Math.max(Math.max(...lats) - Math.min(...lats), minSpan / 3) * 1.5;
	// Fit the box's aspect ratio.
	if (spanLon / (spanLat * ky) < width / inner) spanLon = (spanLat * ky * width) / inner;
	else spanLat = (spanLon * inner) / (width * ky);
	const cLon = (Math.max(...lons) + Math.min(...lons)) / 2;
	const cLat = midLat;
	const scale = spanLon / width;
	return {
		width,
		height,
		west: cLon - spanLon / 2,
		north: cLat + spanLat / 2 + (inset.top * scale) / ky,
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
