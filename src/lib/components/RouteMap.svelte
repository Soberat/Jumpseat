<script lang="ts">
	import { onMount } from 'svelte';
	import {
		bow,
		dotsInView,
		frame,
		greatCircle,
		placeLabels,
		project,
		seamFor,
		splitAtSeam,
		wrapLon,
		type Point
	} from '#lib/route.ts';
	import { DOT_STEP } from '#lib/world-dots.ts';
	import type { TripRoute } from '#lib/trip-route.ts';

	let {
		route,
		width,
		height,
		inset = { top: 0, bottom: 0 }
	}: {
		route: TripRoute;
		/** The size it's drawn at, in CSS pixels, so text and dots keep their size on any screen. */
		width: number;
		height: number;
		inset?: { top: number; bottom: number };
	} = $props();

	const uid = $props.id();
	let motion = $state(false);
	onMount(() => {
		motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	const places = $derived([
		route.home,
		route.destination,
		...route.stops,
		...route.legs.flatMap((l) => [l.from, l.to])
	]);
	// Cut the world where the route isn't, so most trips draw in one piece.
	const seam = $derived(seamFor(places));
	const arcs = $derived(
		route.legs.map((l) => {
			// Start in the map's longitudes and keep going continuously from there.
			const shift = wrapLon(l.from.lon, seam) - l.from.lon;
			return greatCircle(l.from, l.to).map((p) => ({ ...p, lon: p.lon + shift }));
		})
	);
	// A trip all the way round can't avoid the cut: show the whole world, cut at its edges.
	const aroundTheWorld = $derived(
		route.legs.some((l) => splitAtSeam(greatCircle(l.from, l.to), seam).length > 1)
	);
	const view = $derived(
		frame(
			[...places.map((p) => ({ ...p, lon: wrapLon(p.lon, seam) })), ...arcs.flat()],
			width,
			height,
			6,
			inset,
			aroundTheWorld ? seam : null
		)
	);
	const at = (p: Point) => project({ ...p, lon: wrapLon(p.lon, seam) }, view);
	const dots = $derived(dotsInView(view));
	const dotR = $derived(Math.max(0.6, Math.min(2.2, (DOT_STEP / view.scale) * 0.3)));
	const worldPx = $derived(360 / view.scale);
	const small = $derived(width < 500);

	const legs = $derived(
		arcs.map((arc) => {
			const pts = bow(arc.map((p) => project(p, view)));
			const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
			const xs = pts.map(([x]) => x);
			// Where a line runs off one edge of a whole-world map, it comes back in at the other.
			const copies = [
				...(Math.min(...xs) < 0 ? [worldPx] : []),
				...(Math.max(...xs) > width ? [-worldPx] : [])
			];
			return { d, copies };
		})
	);

	// Every place once: the destination first, then home, the stops, and connections last.
	const marks = $derived.by(() => {
		const codes = [
			route.destination,
			route.home,
			...route.stops,
			...route.legs.flatMap((l) => [l.from, l.to])
		].map((s) => s.code);
		const list = [
			{ s: route.destination, kind: 'destination' as const },
			{ s: route.home, kind: 'home' as const },
			...route.stops.map((s) => ({ s, kind: 'stop' as const })),
			...route.legs.flatMap((l) => [l.from, l.to]).map((s) => ({ s, kind: 'via' as const }))
		].filter(({ s }, i) => codes.indexOf(s.code) === i);
		const r = (kind: string) => (kind === 'destination' ? 6 : kind === 'via' ? 3 : 4);
		const pts = list.map(({ s, kind }) => ({ s, kind, xy: at(s), r: r(kind) }));
		const labels = placeLabels(
			pts.map(({ s, kind, xy, r }) => ({
				x: xy[0],
				y: xy[1],
				text: s.code,
				size: kind === 'destination' ? (small ? 14 : 16) : small ? 10 : 12,
				r,
				optional: kind === 'via'
			})),
			width,
			height
		);
		return pts.map((p, i) => ({ ...p, label: labels[i] }));
	});

	// Planes take turns: each flies its leg in its own slot of a shared loop,
	// so the trip plays out in order instead of every flight at once.
	const SLOT = 4.5;
	const cycle = $derived(Math.max(1, route.legs.length) * SLOT);
	function turn(i: number) {
		const n = route.legs.length;
		const a = (i / n).toFixed(4);
		const b = ((i + 1) / n).toFixed(4);
		return { motion: `0;${a};${b};1`, show: `0;${a};${b}` };
	}
</script>

<svg viewBox="0 0 {width} {height}" class="block h-full w-full" role="img" aria-label="Route map">
	<defs>
		<radialGradient id="{uid}-glow">
			<stop offset="0" stop-color="var(--color-runway)" stop-opacity="0.55" />
			<stop offset="1" stop-color="var(--color-runway)" stop-opacity="0" />
		</radialGradient>
		<linearGradient id="{uid}-trail" x1="0" x2="1">
			<stop offset="0" stop-color="white" stop-opacity="0.35" />
			<stop offset="1" stop-color="var(--color-runway)" />
		</linearGradient>
	</defs>

	<g class="fill-white/25">
		{#each dots as [x, y], i (i)}
			<circle cx={x} cy={y} r={dotR} />
		{/each}
	</g>

	{#each marks.filter((m) => m.kind === 'destination') as m (m.s.code)}
		<circle cx={m.xy[0]} cy={m.xy[1]} r={small ? 60 : 80} fill="url(#{uid}-glow)" />
	{/each}

	{#each legs as leg, i (i)}
		{@const planned = route.legs[i].planned}
		{#each [0, ...leg.copies] as dx (dx)}
			<g transform="translate({dx} 0)">
				<path d={leg.d} fill="none" stroke="white" stroke-opacity="0.15" stroke-width="2" />
				<path
					id={dx === 0 ? `${uid}-leg${i}` : undefined}
					d={leg.d}
					fill="none"
					stroke="url(#{uid}-trail)"
					stroke-width="2"
					stroke-linecap="round"
					stroke-dasharray={planned ? '1.5 6' : '4000'}
					pathLength={planned ? undefined : 4000}
					class={planned ? '' : 'animate-draw'}
					style="--len: 4000; animation-delay: {0.3 + i * 0.5}s"
				/>
			</g>
		{/each}
		{#if motion}
			{@const t = turn(i)}
			<g opacity="0">
				<!-- A plane pointing along +x, so rotate="auto" follows the route. -->
				<path
					d="M13 0 5-2.2-1-11h-3.4L-.4-2.2H-8l-2.6-3.6h-2.2L-11.4 0l-1.4 5.8h2.2L-8 2.2h7.6L-4.4 11H-1L5 2.2Z"
					transform="scale({small ? 0.8 : 1.1})"
					class="fill-white"
					style="filter: drop-shadow(0 0 3px rgb(246 178 60 / 0.9))"
				/>
				<animateMotion
					dur="{cycle}s"
					begin="0.6s"
					repeatCount="indefinite"
					rotate="auto"
					keyPoints="0;0;1;1"
					keyTimes={t.motion}
					calcMode="spline"
					keySplines="0 0 1 1;0.45 0 0.55 1;0 0 1 1"
				>
					<mpath href="#{uid}-leg{i}" />
				</animateMotion>
				<!-- Only visible during its own turn. -->
				<animate
					attributeName="opacity"
					dur="{cycle}s"
					begin="0.6s"
					repeatCount="indefinite"
					calcMode="discrete"
					values="0;1;0"
					keyTimes={t.show}
				/>
			</g>
		{/if}
	{/each}

	{#each marks as m (m.s.code)}
		{@const [x, y] = m.xy}
		{#if m.kind === 'destination'}
			<g transform="translate({x} {y})">
				<circle
					r={m.r + 4}
					class="[transform-origin:center] animate-pulse-ring fill-runway/40 [transform-box:fill-box]"
				/>
				<circle
					r={m.r + 4}
					class="[transform-origin:center] animate-pulse-ring fill-runway/40 [transform-box:fill-box]"
					style="animation-delay: 1.2s"
				/>
				<circle r={m.r} class="fill-runway" />
			</g>
		{:else}
			<circle cx={x} cy={y} r={m.r} class={m.kind === 'via' ? 'fill-white/70' : 'fill-white'} />
		{/if}
		{#if m.label}
			<text
				x={m.label.x}
				y={m.label.y}
				text-anchor={m.label.anchor}
				font-size={m.label.size}
				class={[
					'font-mono font-bold',
					m.kind === 'destination'
						? 'fill-white'
						: m.kind === 'via'
							? 'fill-white/60'
							: 'fill-white/85'
				]}
				style="paint-order: stroke; stroke: rgb(0 0 0 / 0.35); stroke-width: 3px"
				>{m.label.text}</text
			>
		{/if}
	{/each}
</svg>
