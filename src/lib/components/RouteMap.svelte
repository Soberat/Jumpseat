<script lang="ts">
	import { onMount } from 'svelte';
	import { dotsInView, frame, greatCircle, pathFor, project } from '#lib/route.ts';
	import type { TripRoute } from '#lib/trip-route.ts';

	let {
		route,
		width = 1000,
		height = 460,
		compact = false,
		inset = { top: 0, bottom: 0 }
	}: {
		route: TripRoute;
		width?: number;
		height?: number;
		compact?: boolean;
		inset?: { top: number; bottom: number };
	} = $props();

	const uid = $props.id();
	let motion = $state(false);
	onMount(() => {
		motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
	});

	const arcs = $derived(route.legs.map((l) => greatCircle(l.from, l.to)));
	const view = $derived(
		frame(
			[route.home, route.destination, ...route.legs.flatMap((l) => [l.from, l.to]), ...arcs.flat()],
			width,
			height,
			compact ? 22 : 26,
			inset
		)
	);
	const dots = $derived(dotsInView(view));
	const dotR = $derived(Math.max(1.1, Math.min(3.4, 0.55 / view.scale)));
	const stops = $derived(
		[...new Map(route.legs.flatMap((l) => [l.from, l.to]).map((s) => [s.code, s])).values()].filter(
			(s) => s.code !== route.destination.code
		)
	);
	const dest = $derived(project(route.destination, view));
	// Arcs lift off the map a little, like a flight path drawn on a chart.
	const lifted = $derived(
		arcs.map((arc) => {
			const n = arc.length - 1;
			return pathFor(
				arc.map((p, i) => ({
					...p,
					lat: p.lat + Math.sin((Math.PI * i) / n) * 0.05 * view.scale * width
				})),
				view
			);
		})
	);
	// Out-and-back legs share a line: one plane per pair is enough.
	const firstOfPair = $derived(
		route.legs.map(
			(l, i) =>
				!route.legs
					.slice(0, i)
					.some(
						(p) => [p.from.code, p.to.code].sort().join() === [l.from.code, l.to.code].sort().join()
					)
		)
	);
	const labelSize = $derived(compact ? 30 : 22);
</script>

<svg viewBox="0 0 {width} {height}" class="block h-full w-full" role="img" aria-label="Route map">
	<defs>
		<radialGradient id="{uid}-glow">
			<stop offset="0" stop-color="var(--color-runway)" stop-opacity="0.55" />
			<stop offset="1" stop-color="var(--color-runway)" stop-opacity="0" />
		</radialGradient>
		<linearGradient id="{uid}-trail" x1="0" x2="1">
			<stop offset="0" stop-color="white" stop-opacity="0.2" />
			<stop offset="1" stop-color="var(--color-runway)" />
		</linearGradient>
	</defs>

	<g class="fill-white/25">
		{#each dots as [x, y], i (i)}
			<circle cx={x} cy={y} r={dotR} />
		{/each}
	</g>

	<circle cx={dest[0]} cy={dest[1]} r={compact ? 120 : 90} fill="url(#{uid}-glow)" />

	{#each lifted as d, i (i)}
		{@const leg = route.legs[i]}
		<path {d} fill="none" stroke="white" stroke-opacity="0.15" stroke-width={compact ? 5 : 3} />
		<path
			id="{uid}-leg{i}"
			{d}
			fill="none"
			stroke="url(#{uid}-trail)"
			stroke-width={compact ? 5 : 3}
			stroke-linecap="round"
			stroke-dasharray={leg.planned ? '2 10' : '4000'}
			pathLength={leg.planned ? undefined : 4000}
			class={leg.planned ? '' : 'animate-draw'}
			style="--len: 4000; animation-delay: {0.3 + i * 0.5}s"
		/>
		{#if motion && firstOfPair[i]}
			<g>
				<!-- A plane pointing along +x, so rotate="auto" follows the route. -->
				<path
					d="M13 0 5-2.2-1-11h-3.4L-.4-2.2H-8l-2.6-3.6h-2.2L-11.4 0l-1.4 5.8h2.2L-8 2.2h7.6L-4.4 11H-1L5 2.2Z"
					transform="scale({compact ? 2.4 : 1.7})"
					class="fill-white"
					style="filter: drop-shadow(0 0 4px rgb(246 178 60 / 0.9))"
				/>
				<animateMotion
					dur="{leg.planned ? 7 : 5}s"
					begin="{0.3 + i * 0.5}s"
					repeatCount="indefinite"
					rotate="auto"
					keyPoints="0;1"
					keyTimes="0;1"
					calcMode="spline"
					keySplines="0.45 0 0.55 1"
				>
					<mpath href="#{uid}-leg{i}" />
				</animateMotion>
			</g>
		{/if}
	{/each}

	{#each stops as s (s.code)}
		{@const [x, y] = project(s, view)}
		<circle cx={x} cy={y} r={compact ? 9 : 6} class="fill-white" />
		<text
			{x}
			y={y + (compact ? 44 : 30)}
			text-anchor="middle"
			font-size={labelSize}
			class="fill-white/80 font-mono font-bold">{s.code}</text
		>
	{/each}

	<g transform="translate({dest[0]} {dest[1]})">
		<circle
			r={compact ? 16 : 11}
			class="[transform-origin:center] animate-pulse-ring fill-runway/40 [transform-box:fill-box]"
		/>
		<circle
			r={compact ? 16 : 11}
			class="[transform-origin:center] animate-pulse-ring fill-runway/40 [transform-box:fill-box]"
			style="animation-delay: 1.2s"
		/>
		<circle r={compact ? 10 : 7} class="fill-runway" />
		<text
			y={compact ? -26 : -20}
			text-anchor="middle"
			font-size={labelSize + 4}
			class="fill-white font-mono font-bold">{route.destination.code}</text
		>
	</g>
</svg>
