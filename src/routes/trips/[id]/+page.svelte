<script lang="ts">
	import { enhance } from '$app/forms';
	import AddToTimeline from '#lib/components/AddToTimeline.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import type { Flight } from '#lib/server/db/schema.ts';
	import TripWhenFields from '#lib/components/TripWhenFields.svelte';
	import Weather from '#lib/components/Weather.svelte';
	import PackingList from '#lib/components/PackingList.svelte';
	import Expenses from '#lib/components/Expenses.svelte';
	import ThingsToDo from '#lib/components/ThingsToDo.svelte';
	import TripHero from '#lib/components/TripHero.svelte';
	import { bestOptions, ODDS_LABELS, oddsFor, type Odds } from '#lib/standby.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const loadsFor = (flightId: string) => data.loads.filter((l) => l.flightId === flightId);
	const best = $derived(
		bestOptions(
			data.timeline.days.flatMap((d) =>
				d.entries.flatMap((e) => (e.type === 'flight' ? [e.flight] : []))
			),
			data.loads
		)
	);
	const ODDS_STYLES: Record<Odds, string> = {
		good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
		tight: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
		unlikely: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
	};
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
		{@const rated = oddsFor(loads)}
		<div class="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
			{#if rated}
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span class={['rounded px-2 py-0.5 font-medium', ODDS_STYLES[rated.odds]]}>
						{ODDS_LABELS[rated.odds]}
					</span>
					<span class="text-slate-500 dark:text-slate-400">
						{rated.margin >= 0
							? `${rated.margin} spare after the list`
							: `${-rated.margin} more listed than seats`}
					</span>
					{#if best.has(f.id)}
						<span
							class="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
						>
							★ Best option for this leg
						</span>
					{/if}
				</div>
			{/if}
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
			<details class="text-sm">
				<summary class="cursor-pointer text-blue-900 dark:text-blue-300">
					Add a backup flight on {f.origin} → {f.destination}
				</summary>
				<form method="POST" action="?/addFlight" use:enhance class="mt-2 flex flex-wrap gap-2">
					<input type="hidden" name="origin" value={f.origin} />
					<input type="hidden" name="destination" value={f.destination} />
					<input type="hidden" name="departureDate" value={f.departureDate} />
					<input type="hidden" name="standby" value="on" />
					<input
						name="flightNumber"
						required
						placeholder="LH1172"
						aria-label="Backup flight number"
						class="w-28"
					/>
					<input name="departureTime" type="time" aria-label="Backup departure time" />
					<button
						class="rounded-lg border border-blue-900 px-3 py-2 font-medium text-blue-900 dark:border-blue-300 dark:text-blue-300"
					>
						Add backup
					</button>
				</form>
			</details>
		</div>
	{/if}
{/snippet}

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
</svelte:head>

<a href="/" class="-mb-3 inline-block text-sm text-blue-900 hover:underline dark:text-blue-300"
	>← All trips</a
>
<TripHero
	id={data.trip.id}
	title={data.trip.title}
	when={data.trip}
	today={data.today}
	route={data.route}
	timezone={data.trip.timezone}
/>

<details class="card" open={!!form?.tripError}>
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

<a
	href="/trips/{data.trip.id}/plan"
	class="flex items-center gap-3 rounded-xl bg-linear-to-r from-blue-900 to-violet-700 p-4 text-white shadow-sm hover:opacity-95"
>
	<span class="text-2xl" aria-hidden="true">✨</span>
	<span class="flex-1">
		<span class="block font-semibold">Plan with AI</span>
		<span class="block text-sm text-blue-100"
			>Tell it your style, budget and wishes, and get a day-by-day draft.</span
		>
	</span>
	<span aria-hidden="true">→</span>
</a>

{#if data.trip.latitude !== null && data.weather}
	<Weather weather={data.weather} place={data.trip.destination} />
{:else}
	<p class="card text-sm text-slate-500 dark:text-slate-400">
		Weather will show once "{data.trip.destination}" can be found on the map. Check the spelling, or
		try again when you are online.
	</p>
{/if}

<section class="card space-y-4">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-semibold">Timeline</h2>
		<a
			href="/trips/{data.trip.id}/calendar.ics"
			download
			class="text-sm text-blue-900 hover:underline dark:text-blue-300">📅 Add to calendar</a
		>
	</div>
	<TimelineView timeline={data.timeline} tripStart={data.trip.startDate}>
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
	<AddToTimeline
		error={form?.itemError ?? form?.flightError}
		today={data.today}
		tripStart={data.trip.startDate}
	/>
</section>

{#if data.trip.latitude !== null}
	<ThingsToDo
		sights={data.sights}
		place={data.trip.destination}
		planned={[
			...data.timeline.days.flatMap((d) =>
				d.entries.flatMap((e) => (e.type === 'item' ? [e.item.title] : []))
			),
			...data.timeline.unscheduled.map((i) => i.title)
		]}
	/>
{/if}

<PackingList items={data.packing} weather={data.weather} error={form?.packingError} />

<Expenses
	expenses={data.expenses}
	today={data.today}
	error={form?.expenseError}
	lastCurrency={form?.expenseCurrency}
/>

<section class="card space-y-3">
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
