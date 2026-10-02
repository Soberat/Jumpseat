<script lang="ts">
	import TripHero from '#lib/components/TripHero.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import Weather from '#lib/components/Weather.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<p class="-mb-3 font-mono text-xs tracking-[0.2em] text-slate-400 uppercase dark:text-slate-500">
	Shared trip
</p>
<TripHero
	id="shared"
	title={data.trip.title}
	when={data.trip}
	today={data.today}
	route={data.route}
	timezone={data.trip.timezone}
/>

{#if data.weather}
	<Weather weather={data.weather} place={data.trip.destination} />
{/if}

<a
	href="/s/{data.token}/journey"
	class="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-ink-900 p-4 text-white shadow-lg transition hover:shadow-xl"
>
	<span
		class="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-runway text-2xl text-ink-950 transition group-hover:scale-110"
		aria-hidden="true">🗺️</span
	>
	<span class="relative min-w-0 flex-1">
		<span class="block font-display text-lg font-bold">Open the journey</span>
		<span class="block text-sm text-white/70"
			>{data.canEdit
				? 'You can plan along: drag ideas and sights onto the days, set times and lengths.'
				: 'The trip day by day, full screen.'}</span
		>
	</span>
	<span class="relative text-xl transition group-hover:translate-x-1" aria-hidden="true">→</span>
</a>

<section class="card space-y-4">
	<h2 class="text-lg font-semibold">Timeline</h2>
	<TimelineView
		timeline={data.timeline}
		tripStart={data.schedule.start}
		undated={data.schedule.undated}
	/>
</section>
