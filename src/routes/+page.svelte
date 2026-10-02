<script lang="ts">
	import BoardingPass from '#lib/components/BoardingPass.svelte';
	import OriginField from '#lib/components/OriginField.svelte';
	import TripWhenFields from '#lib/components/TripWhenFields.svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Jumpseat</title>
</svelte:head>

<section class="space-y-3">
	<div class="flex items-end justify-between gap-2">
		<h1 class="text-3xl font-bold">Your trips</h1>
		{#if data.trips.length > 0}
			<span class="font-mono text-xs tracking-wider text-slate-500 uppercase dark:text-slate-400">
				{data.trips.length} on the board
			</span>
		{/if}
	</div>
	{#if data.trips.length === 0}
		<div class="card flex flex-col items-center gap-2 py-10 text-center">
			<span class="text-5xl" aria-hidden="true">🗺️</span>
			<p class="font-display text-lg font-semibold">Nowhere planned yet</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				Add your first trip below and it gets its own boarding pass.
			</p>
		</div>
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

<section class="card">
	<h2 class="mb-3 text-lg font-semibold">✈ New trip</h2>
	<form method="POST" action="?/create" use:enhance class="grid gap-3 sm:grid-cols-2">
		<label class="flex flex-col gap-1 text-sm">
			Name
			<input name="title" required value={form?.title ?? ''} placeholder="Autumn in Lisbon" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			Destination
			<input name="destination" required value={form?.destination ?? ''} placeholder="Lisbon" />
		</label>
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
