<script lang="ts">
	import { enhance } from '$app/forms';
	import type { TripWeather } from '#lib/climate.ts';
	import { BASICS, STANDBY_ESSENTIALS, weatherSuggestions } from '#lib/packing.ts';
	import type { PackingItem } from '#lib/server/db/schema.ts';

	let {
		items,
		weather,
		error
	}: { items: PackingItem[]; weather: TripWeather | null; error?: string } = $props();

	const onList = $derived(new Set(items.map((i) => i.label.toLowerCase())));
	const suggestions = $derived(
		weatherSuggestions(weather).filter((s) => !onList.has(s.label.toLowerCase()))
	);
	const missing = (labels: string[]) => labels.filter((l) => !onList.has(l.toLowerCase()));
	const packed = $derived(items.filter((i) => i.packed).length);
</script>

<section class="space-y-3 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
	<div class="flex items-baseline justify-between gap-2">
		<h2 class="text-lg font-semibold">Packing list</h2>
		{#if items.length > 0}
			<span class="text-sm text-slate-500 dark:text-slate-400">
				{packed} of {items.length} packed
			</span>
		{/if}
	</div>

	{#if items.length > 0}
		<div class="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
			<div
				class="h-full rounded-full bg-emerald-500 transition-all"
				style:width="{(packed / items.length) * 100}%"
			></div>
		</div>
		<ul class="divide-y divide-slate-100 dark:divide-slate-700">
			{#each items as item (item.id)}
				<li class="flex items-center gap-3 py-1.5">
					<form method="POST" action="?/togglePacking" use:enhance class="flex flex-1 items-center">
						<input type="hidden" name="id" value={item.id} />
						<input type="hidden" name="packed" value={String(!item.packed)} />
						<label class="flex flex-1 cursor-pointer items-center gap-3">
							<input
								type="checkbox"
								checked={item.packed}
								onchange={(e) => e.currentTarget.form?.requestSubmit()}
								class="size-5 shrink-0 accent-emerald-600"
							/>
							<span class={item.packed ? 'text-slate-400 line-through dark:text-slate-500' : ''}>
								{item.label}
							</span>
						</label>
					</form>
					<form method="POST" action="?/deletePacking" use:enhance>
						<input type="hidden" name="id" value={item.id} />
						<button
							class="px-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
							aria-label="Remove {item.label}">×</button
						>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-slate-500 dark:text-slate-400">
			Nothing on the list yet. Start from a set below or add your own.
		</p>
	{/if}

	<form method="POST" action="?/addPacking" use:enhance class="flex gap-2 text-sm">
		<input
			name="label"
			placeholder="Add an item"
			aria-label="Item to pack"
			class="min-w-0 flex-1"
		/>
		<button class="rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
			>Add</button
		>
	</form>
	{#if error}<p class="text-sm text-red-600 dark:text-red-400">{error}</p>{/if}

	{#if suggestions.length > 0}
		<div class="space-y-1.5">
			<p class="text-sm text-slate-500 dark:text-slate-400">Suggested for the weather</p>
			<div class="flex flex-wrap gap-2">
				{#each suggestions as s (s.label)}
					<form method="POST" action="?/addPacking" use:enhance>
						<input type="hidden" name="label" value={s.label} />
						<button
							class="rounded-full border border-slate-300 px-3 py-1 text-sm hover:border-blue-900 dark:border-slate-600 dark:hover:border-blue-300"
						>
							+ {s.label} <span class="text-slate-500 dark:text-slate-400">({s.why})</span>
						</button>
					</form>
				{/each}
			</div>
		</div>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#each [{ name: 'standby essentials', labels: STANDBY_ESSENTIALS, icon: '🎫' }, { name: 'the basics', labels: BASICS, icon: '🧳' }] as set (set.name)}
			{@const toAdd = missing(set.labels)}
			{#if toAdd.length > 0}
				<form method="POST" action="?/addPacking" use:enhance>
					{#each toAdd as label (label)}
						<input type="hidden" name="label" value={label} />
					{/each}
					<button
						class="rounded-lg border border-blue-900 px-3 py-2 text-sm font-medium text-blue-900 dark:border-blue-300 dark:text-blue-300"
					>
						{set.icon} Add {set.name} ({toAdd.length})
					</button>
				</form>
			{/if}
		{/each}
	</div>
</section>
