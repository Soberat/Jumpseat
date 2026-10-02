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

<section class="card space-y-4">
	<h2 class="text-lg font-semibold">Timeline</h2>
	<TimelineView timeline={data.timeline} tripStart={data.trip.startDate} />
</section>
