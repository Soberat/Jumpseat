<script lang="ts">
	import { formatClock, formatNumber } from '#lib/format.ts';
	import { onMount } from 'svelte';
	import { countdown } from '#lib/countdown.ts';
	import { describeWhen, type TripWhen } from '#lib/when.ts';
	import type { TripRoute } from '#lib/trip-route.ts';
	import RouteMap from './RouteMap.svelte';
	import SplitFlap from './SplitFlap.svelte';

	let {
		id,
		title,
		when,
		today,
		route,
		timezone,
		weather = null
	}: {
		id: string;
		title: string;
		when: TripWhen;
		today: string;
		route: TripRoute | null;
		timezone: string | null;
		/** One line, like "🌤️ 21–24°, mostly dry". */
		weather?: string | null;
	} = $props();

	const board = $derived(countdown(when, today));
	// The map is drawn at the hero's real size, kept clear of the text over it.
	let mapW = $state(0);
	let mapH = $state(0);
	let topH = $state(40);
	let bottomH = $state(90);

	// The sky behind the map follows the time of day at the destination.
	let localTime = $state<string | null>(null);
	let hour = $state(12);
	onMount(() => {
		if (!timezone) return;
		const tick = () => {
			const now = new Date();
			localTime = formatClock(now, timezone);
			hour = Number(
				new Intl.DateTimeFormat('en-GB', {
					timeZone: timezone,
					hour: 'numeric',
					hourCycle: 'h23'
				}).format(now)
			);
		};
		tick();
		const t = setInterval(tick, 30_000);
		return () => clearInterval(t);
	});
	const sky = $derived(
		hour >= 21 || hour < 5 ? 'night' : hour < 8 ? 'dawn' : hour >= 18 ? 'dusk' : 'day'
	);
	const SKIES = {
		night: 'from-ink-950 via-ink-900 to-ink-800',
		dawn: 'from-ink-800 via-[#6b3f8f] to-[#f59e6b]',
		day: 'from-[#0c3a8a] via-[#1d5fc4] to-[#5aa1e8]',
		dusk: 'from-ink-900 via-[#7a3b6f] to-[#f08a4b]'
	};
	// Deterministic "stars" so server and browser render the same thing.
	const stars = Array.from({ length: 40 }, (_, i) => ({
		x: (i * 37.7) % 100,
		y: (i * 53.3) % 60,
		d: (i % 7) * 0.6
	}));
</script>

<section
	class={[
		'relative isolate h-80 overflow-hidden rounded-3xl bg-linear-to-b text-white shadow-lg transition-colors duration-1000',
		SKIES[sky]
	]}
>
	{#if sky === 'night' || sky === 'dusk'}
		<div class="absolute inset-0" aria-hidden="true">
			{#each stars as s, i (i)}
				<span
					class="absolute size-0.5 animate-twinkle rounded-full bg-white"
					style="left: {s.x}%; top: {s.y}%; animation-delay: {s.d}s"
				></span>
			{/each}
		</div>
	{/if}

	<div
		class="absolute inset-0 animate-[rise_1s_ease-out_both]"
		bind:clientWidth={mapW}
		bind:clientHeight={mapH}
	>
		{#if route && mapW > 0}
			<RouteMap
				{route}
				width={mapW}
				height={mapH}
				inset={{ top: topH + 16, bottom: bottomH + 20 }}
			/>
		{/if}
	</div>
	<div class="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent"></div>

	<div
		class="absolute inset-x-3 top-3 flex items-start justify-between gap-2"
		bind:clientHeight={topH}
	>
		<div class="flex min-w-0 flex-wrap gap-1.5 text-xs font-medium">
			{#if localTime}
				<span class="rounded-full bg-black/30 px-2.5 py-1 backdrop-blur"
					>🕒 {localTime} in {route?.destination.label ?? 'destination'}</span
				>
			{/if}
			{#if weather}
				<a
					href="#weather"
					class="rounded-full bg-white/90 px-2.5 py-1 font-semibold text-ink-950 shadow-sm hover:bg-white"
					>{weather}</a
				>
			{/if}
			{#if route && route.distanceKm > 0}
				<span class="rounded-full bg-black/30 px-2.5 py-1 backdrop-blur"
					>{formatNumber(route.distanceKm)} km {route.stops.length
						? 'all the way round'
						: `from ${route.home.code}`}</span
				>
			{/if}
		</div>
		<div class="flex shrink-0 flex-col items-end gap-1">
			<SplitFlap text={board.big} size="md" delay={300} />
			<span class="font-mono text-[10px] font-bold tracking-[0.2em] text-white/80"
				>{board.caption}</span
			>
		</div>
	</div>

	<div class="absolute inset-x-4 bottom-4" bind:clientHeight={bottomH}>
		<h1
			class="text-3xl leading-tight font-bold drop-shadow sm:text-4xl"
			style="view-transition-name: trip-title-{id}"
		>
			{title}
		</h1>
		<p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-white/85">
			{#if route}
				<span
					class="font-mono font-bold tracking-wider"
					style="view-transition-name: trip-codes-{id}"
					>{[route.home, route.destination, ...route.stops].map((s) => s.code).join(' ✈ ')}</span
				>
				<span aria-hidden="true">·</span>
			{/if}
			<span>{describeWhen(when)}</span>
		</p>
	</div>
</section>
