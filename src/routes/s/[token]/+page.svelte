<script lang="ts">
	import { placeAndDates } from '#lib/format.ts';
	import FlightCard from '#lib/components/FlightCard.svelte';
	import Forecast from '#lib/components/Forecast.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div>
	<p class="text-xs tracking-wide text-slate-400 uppercase">Shared trip</p>
	<h1 class="mt-1 text-2xl font-bold">{data.trip.title}</h1>
	<p class="text-slate-500">
		{placeAndDates(data.trip.destination, data.trip.startDate, data.trip.endDate)}
	</p>
</div>

{#if data.trip.hasLocation}
	<Forecast days={data.forecast} place={data.trip.destination} />
{/if}

{#if data.flights.length > 0}
	<section class="space-y-3 rounded-xl bg-white p-4 shadow-sm">
		<h2 class="text-lg font-semibold">Flights</h2>
		<ul class="space-y-2">
			{#each data.flights as f (f.id)}
				<FlightCard flight={f} />
			{/each}
		</ul>
	</section>
{/if}
