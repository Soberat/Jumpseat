<script lang="ts">
	import { untrack } from 'svelte';
	import { upcomingQuarters, whenMode, type TripWhen, type WhenMode } from '#lib/when.ts';

	let { when, today }: { when?: TripWhen; today: string } = $props();

	const initial = $derived(when ?? { startDate: null, endDate: null, plannedPeriod: null });
	// Starts from the saved trip; the parent re-creates this component when the trip changes.
	let mode = $state<WhenMode>(untrack(() => (when ? whenMode(when) : 'exact')));

	const MODES: [WhenMode, string][] = [
		['exact', 'Exact dates'],
		['month', 'A month'],
		['quarter', 'A quarter'],
		['none', 'Not decided']
	];

	// Keep a quarter that's already in the past selectable when editing an older trip.
	const quarters = $derived.by(() => {
		const list = upcomingQuarters(today);
		const current = initial.plannedPeriod;
		return current && /Q/.test(current) && !list.includes(current) ? [current, ...list] : list;
	});
	const quarterLabel = (q: string) => `Q${q.slice(-1)} ${q.slice(0, 4)}`;
</script>

<fieldset class="col-span-full space-y-2">
	<legend class="mb-1 text-sm">When</legend>
	<div class="flex flex-wrap gap-2">
		{#each MODES as [value, label] (value)}
			<label
				class={[
					'cursor-pointer rounded-full border px-3 py-1 text-sm',
					mode === value
						? 'border-blue-900 bg-blue-900 text-white dark:border-blue-300 dark:bg-blue-300 dark:text-slate-900'
						: 'border-slate-300 dark:border-slate-600'
				]}
			>
				<input type="radio" name="when" {value} bind:group={mode} class="sr-only" />
				{label}
			</label>
		{/each}
	</div>

	{#if mode === 'exact'}
		<div class="grid grid-cols-2 gap-3">
			<label class="flex flex-col gap-1 text-sm">
				From
				<input type="date" name="startDate" required value={initial.startDate ?? ''} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				To
				<input type="date" name="endDate" value={initial.endDate ?? ''} />
			</label>
		</div>
	{:else if mode === 'month'}
		<label class="flex flex-col gap-1 text-sm">
			Month
			<input
				type="month"
				name="month"
				required
				min={today.slice(0, 7)}
				value={initial.plannedPeriod && !initial.plannedPeriod.includes('Q')
					? initial.plannedPeriod
					: ''}
			/>
		</label>
	{:else if mode === 'quarter'}
		<label class="flex flex-col gap-1 text-sm">
			Quarter
			<select name="quarter" value={initial.plannedPeriod ?? quarters[0]}>
				{#each quarters as q (q)}
					<option value={q}>{quarterLabel(q)}</option>
				{/each}
			</select>
		</label>
	{:else}
		<p class="text-sm text-slate-500 dark:text-slate-400">
			No problem. You can add dates once you know them.
		</p>
	{/if}
</fieldset>
