<script lang="ts">
	import { placeAndWhen } from '#lib/format.ts';
	import { enhance } from '$app/forms';
	import AddToTimeline from '#lib/components/AddToTimeline.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import type { Flight } from '#lib/server/db/schema.ts';
	import TripWhenFields from '#lib/components/TripWhenFields.svelte';
	import Weather from '#lib/components/Weather.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const loadsFor = (flightId: string) => data.loads.filter((l) => l.flightId === flightId);
	const time = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
</script>

{#snippet remove(action: string, name: string, id: string, what: string)}
	<form method="POST" {action} use:enhance class="mt-1 text-right">
		<input type="hidden" {name} value={id} />
		<button
			class="text-xs text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
			>Remove {what}</button
		>
	</form>
{/snippet}

{#snippet standby(f: Flight)}
	{#if f.standby}
		{@const loads = loadsFor(f.id)}
		<div class="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
			{#if loads.length > 0}
				<ul class="space-y-1 text-sm">
					{#each loads as l (l.id)}
						<li class="flex flex-wrap gap-x-3">
							<span class="text-slate-400 dark:text-slate-500">{time(l.recordedAt)}</span>
							<span class="capitalize">{l.cabin}</span>
							<span class="font-medium">{l.seatsAvailable} open</span>
							{#if l.standbyListed !== null}<span>{l.standbyListed} listed</span>{/if}
							{#if l.note}<span class="text-slate-500 dark:text-slate-400">{l.note}</span>{/if}
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
				<button class="rounded-lg bg-amber-500 px-3 py-2 font-medium text-white">Log load</button>
				{#if form?.loadError && form.flightId === f.id}
					<p class="w-full text-red-600 dark:text-red-400">{form.loadError}</p>
				{/if}
			</form>
		</div>
	{/if}
{/snippet}

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
</svelte:head>

<div>
	<a href="/" class="text-sm text-blue-900 hover:underline dark:text-blue-300">← All trips</a>
	<h1 class="mt-1 text-2xl font-bold">{data.trip.title}</h1>
	<p class="text-slate-500 dark:text-slate-400">
		{placeAndWhen(data.trip.destination, data.trip)}
	</p>
</div>

<details class="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800" open={!!form?.tripError}>
	<summary class="cursor-pointer font-semibold">Edit trip</summary>
	<form
		method="POST"
		action="?/update"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="mt-3 grid gap-3 sm:grid-cols-2"
	>
		<label class="flex flex-col gap-1 text-sm">
			Name
			<input name="title" required value={data.trip.title} />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			Destination
			<input name="destination" required value={data.trip.destination} />
		</label>
		{#key data.trip}
			<TripWhenFields when={data.trip} today={data.today} />
		{/key}
		{#if form?.tripError}
			<p class="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{form.tripError}</p>
		{/if}
		<button
			class="rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800 sm:col-span-2"
		>
			Save
		</button>
	</form>
</details>

{#if data.trip.latitude !== null && data.weather}
	<Weather weather={data.weather} place={data.trip.destination} />
{:else}
	<p
		class="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400"
	>
		Weather will show once "{data.trip.destination}" can be found on the map. Check the spelling, or
		try again when you are online.
	</p>
{/if}

<section class="space-y-4 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
	<h2 class="text-lg font-semibold">Timeline</h2>
	<TimelineView timeline={data.timeline}>
		{#snippet extra(entry)}
			{#if entry.type === 'flight'}
				{@render standby(entry.flight)}
				{@render remove('?/deleteFlight', 'flightId', entry.flight.id, 'flight')}
			{:else if entry.phase !== 'end'}
				{@render remove('?/deleteItem', 'itemId', entry.item.id, 'entry')}
			{/if}
		{/snippet}
		{#snippet itemExtra(item)}
			{@render remove('?/deleteItem', 'itemId', item.id, 'entry')}
		{/snippet}
	</TimelineView>
	<AddToTimeline error={form?.itemError ?? form?.flightError} />
</section>

<section class="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
	<h2 class="text-lg font-semibold">Sharing</h2>
	<p class="text-sm text-slate-500 dark:text-slate-400">
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
			<button class="text-red-600 hover:underline dark:text-red-400">Revoke</button>
		</form>
	{/each}
	<form method="POST" action="?/share" use:enhance>
		<button
			class="rounded-lg border border-blue-900 px-3 py-2 text-sm font-medium text-blue-900 dark:border-blue-300 dark:text-blue-300"
		>
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
	<button class="text-sm text-red-600 hover:underline dark:text-red-400">Delete trip</button>
</form>
