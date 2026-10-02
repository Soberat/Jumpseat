<script lang="ts">
	import BoardingPass from '#lib/components/BoardingPass.svelte';
	import OriginField from '#lib/components/OriginField.svelte';
	import StopsField from '#lib/components/StopsField.svelte';
	import TripWhenFields from '#lib/components/TripWhenFields.svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// The form only takes space when you're adding a trip (or have none yet).
	let creating = $state(false);
	const showForm = $derived(creating || data.trips.length === 0 || !!form?.error);
</script>

{#snippet newTrip()}
	<section class="card" id="new-trip">
		<div class="mb-3 flex items-center justify-between gap-2">
			<h2 class="text-lg font-semibold">✈ New trip</h2>
			{#if data.trips.length > 0}
				<button
					type="button"
					onclick={() => (creating = false)}
					class="min-h-9 px-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
					>Cancel</button
				>
			{/if}
		</div>
		<form method="POST" action="?/create" use:enhance class="grid gap-3 sm:grid-cols-2">
			<label class="flex flex-col gap-1 text-sm">
				Name
				<input name="title" required value={form?.title ?? ''} placeholder="Autumn in Lisbon" />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Destination
				<input name="destination" required value={form?.destination ?? ''} placeholder="Lisbon" />
			</label>
			<StopsField />
			<OriginField />
			<TripWhenFields today={data.today} />
			{#if form?.error}
				<p class="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{form.error}</p>
			{/if}
			<button
				class="rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800 sm:col-span-2"
			>
				Create trip
			</button>
		</form>
	</section>
{/snippet}

<svelte:head>
	<title>Jumpseat</title>
</svelte:head>

<section class="space-y-3">
	<div class="flex items-end justify-between gap-2">
		<h1 class="text-3xl font-bold">Your trips</h1>
		{#if data.trips.length > 0 && !showForm}
			<button
				type="button"
				onclick={() => (creating = true)}
				class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800"
				>+ New trip</button
			>
		{/if}
	</div>
	{#if data.trips.length > 0}
		{#if showForm}{@render newTrip()}{/if}
		<p class="font-mono text-xs tracking-wider text-slate-500 uppercase dark:text-slate-400">
			{data.trips.length} on the board
		</p>
	{/if}
	{#if data.trips.length === 0}
		<div class="card flex flex-col items-center gap-2 py-10 text-center">
			<span class="text-5xl" aria-hidden="true">🗺️</span>
			<p class="font-display text-lg font-semibold">Nowhere planned yet</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Add your first trip below and it gets its own boarding pass.
			</p>
		</div>
		{@render newTrip()}
	{:else}
		<ul class="space-y-3">
			{#each data.trips as t, i (t.id)}
				<li>
					<BoardingPass
						id={t.id}
						title={t.title}
						when={t}
						today={data.today}
						from={t.from}
						fromLabel={t.fromLabel}
						to={t.to}
						toLabel={t.toLabel}
						index={i}
					/>
				</li>
			{/each}
		</ul>
	{/if}
</section>
