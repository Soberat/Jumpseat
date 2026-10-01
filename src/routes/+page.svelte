<script lang="ts">
	import { placeAndDates } from '#lib/format.ts';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Jumpseat</title>
</svelte:head>

<section class="space-y-3">
	<h1 class="text-2xl font-bold">Your trips</h1>
	{#if data.trips.length === 0}
		<p class="text-slate-500">No trips yet. Add your first one below.</p>
	{:else}
		<ul class="space-y-2">
			{#each data.trips as t (t.id)}
				<li>
					<a
						href="/trips/{t.id}"
						class="block rounded-xl bg-white p-4 shadow-sm transition hover:shadow-md"
					>
						<div class="font-semibold">{t.title}</div>
						<div class="text-sm text-slate-500">
							{placeAndDates(t.destination, t.startDate, t.endDate)}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="rounded-xl bg-white p-4 shadow-sm">
	<h2 class="mb-3 text-lg font-semibold">New trip</h2>
	<form method="POST" action="?/create" use:enhance class="grid gap-3 sm:grid-cols-2">
		<label class="flex flex-col gap-1 text-sm">
			Name
			<input name="title" required value={form?.title ?? ''} placeholder="Autumn in Lisbon" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			Destination
			<input name="destination" required value={form?.destination ?? ''} placeholder="Lisbon" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			From
			<input type="date" name="startDate" />
		</label>
		<label class="flex flex-col gap-1 text-sm">
			To
			<input type="date" name="endDate" />
		</label>
		{#if form?.error}
			<p class="text-sm text-red-600 sm:col-span-2">{form.error}</p>
		{/if}
		<button
			class="rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800 sm:col-span-2"
		>
			Create trip
		</button>
	</form>
</section>
