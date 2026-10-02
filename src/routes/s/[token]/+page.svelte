<script lang="ts">
	import { placeAndWhen } from '#lib/format.ts';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import Weather from '#lib/components/Weather.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div>
	<p class="text-xs tracking-wide text-slate-400 uppercase dark:text-slate-500">Shared trip</p>
	<h1 class="mt-1 text-2xl font-bold">{data.trip.title}</h1>
	<p class="text-slate-500 dark:text-slate-400">
		{placeAndWhen(data.trip.destination, data.trip)}
	</p>
</div>

{#if data.weather}
	<Weather weather={data.weather} place={data.trip.destination} />
{/if}

<section class="space-y-4 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
	<h2 class="text-lg font-semibold">Timeline</h2>
	<TimelineView timeline={data.timeline} />
</section>
