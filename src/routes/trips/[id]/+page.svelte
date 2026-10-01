<script lang="ts">
	import { placeAndDates } from '#lib/format.ts';
	import { enhance } from '$app/forms';
	import FlightCard from '#lib/components/FlightCard.svelte';
	import Forecast from '#lib/components/Forecast.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const loadsFor = (flightId: string) => data.loads.filter((l) => l.flightId === flightId);
	const time = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
</svelte:head>

<div>
	<a href="/" class="text-sm text-blue-900 hover:underline">← All trips</a>
	<h1 class="mt-1 text-2xl font-bold">{data.trip.title}</h1>
	<p class="text-slate-500">
		{placeAndDates(data.trip.destination, data.trip.startDate, data.trip.endDate)}
	</p>
</div>

{#if data.trip.latitude !== null}
	<Forecast days={data.forecast} place={data.trip.destination} />
{:else}
	<p class="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
		Weather will show once "{data.trip.destination}" can be found on the map. Check the spelling, or
		try again when you are online.
	</p>
{/if}

<section class="space-y-3 rounded-xl bg-white p-4 shadow-sm">
	<h2 class="text-lg font-semibold">Flights</h2>
	{#if data.flights.length === 0}
		<p class="text-sm text-slate-500">No flights yet.</p>
	{/if}
	<ul class="space-y-2">
		{#each data.flights as f (f.id)}
			<FlightCard flight={f}>
				{#if f.standby}
					{@const loads = loadsFor(f.id)}
					<div class="mt-3 space-y-2 border-t border-slate-100 pt-3">
						{#if loads.length > 0}
							<ul class="space-y-1 text-sm">
								{#each loads as l (l.id)}
									<li class="flex flex-wrap gap-x-3">
										<span class="text-slate-400">{time(l.recordedAt)}</span>
										<span class="capitalize">{l.cabin}</span>
										<span class="font-medium">{l.seatsAvailable} open</span>
										{#if l.standbyListed !== null}<span>{l.standbyListed} listed</span>{/if}
										{#if l.note}<span class="text-slate-500">{l.note}</span>{/if}
									</li>
								{/each}
							</ul>
						{/if}
						<form
							method="POST"
							action="?/logLoad"
							use:enhance
							class="flex flex-wrap items-end gap-2 text-sm"
						>
							<input type="hidden" name="flightId" value={f.id} />
							<select name="cabin" aria-label="Cabin">
								<option value="economy">Economy</option>
								<option value="premium">Premium</option>
								<option value="business">Business</option>
								<option value="first">First</option>
							</select>
							<input
								name="seatsAvailable"
								type="number"
								min="0"
								required
								placeholder="Open seats"
								class="w-28"
							/>
							<input name="standbyListed" type="number" min="0" placeholder="Listed" class="w-24" />
							<input name="note" placeholder="Note" class="min-w-0 flex-1" />
							<button class="rounded-lg bg-amber-500 px-3 py-2 font-medium text-white">
								Log load
							</button>
							{#if form?.loadError && form.flightId === f.id}
								<p class="w-full text-red-600">{form.loadError}</p>
							{/if}
						</form>
					</div>
				{/if}
				<form method="POST" action="?/deleteFlight" use:enhance class="mt-2 text-right">
					<input type="hidden" name="flightId" value={f.id} />
					<button class="text-xs text-slate-400 hover:text-red-600">Remove flight</button>
				</form>
			</FlightCard>
		{/each}
	</ul>

	<form
		method="POST"
		action="?/addFlight"
		use:enhance
		class="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-6"
	>
		<input name="flightNumber" required placeholder="LH400" aria-label="Flight number" />
		<input name="origin" required maxlength="4" placeholder="FRA" aria-label="From" />
		<input name="destination" required maxlength="4" placeholder="JFK" aria-label="To" />
		<input name="departureDate" type="date" required aria-label="Date" />
		<input name="departureTime" type="time" aria-label="Departure time" />
		<label class="flex items-center gap-2">
			<input type="checkbox" name="standby" checked /> Standby
		</label>
		{#if form?.flightError}
			<p class="col-span-full text-red-600">{form.flightError}</p>
		{/if}
		<button
			class="col-span-full rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
		>
			Add flight
		</button>
	</form>
</section>

<section class="space-y-3 rounded-xl bg-white p-4 shadow-sm">
	<h2 class="text-lg font-semibold">Sharing</h2>
	<p class="text-sm text-slate-500">
		A share link shows this trip's plan and weather to anyone who has it, without access to the rest
		of Jumpseat. Standby loads stay private.
	</p>
	{#each data.shares as s (s.token)}
		<form method="POST" action="?/revokeShare" use:enhance class="flex items-center gap-2 text-sm">
			<input type="hidden" name="token" value={s.token} />
			<input
				readonly
				value={s.url}
				class="min-w-0 flex-1 font-mono text-xs"
				aria-label="Share link"
			/>
			<button class="text-red-600 hover:underline">Revoke</button>
		</form>
	{/each}
	<form method="POST" action="?/share" use:enhance>
		<button class="rounded-lg border border-blue-900 px-3 py-2 text-sm font-medium text-blue-900">
			Create share link
		</button>
	</form>
</section>

<form
	method="POST"
	action="?/delete"
	onsubmit={(e) => {
		if (!confirm('Delete this trip and all its flights?')) e.preventDefault();
	}}
>
	<button class="text-sm text-red-600 hover:underline">Delete trip</button>
</form>
