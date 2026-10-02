<script lang="ts">
	import { untrack } from 'svelte';
	import { upcomingMonths } from '#lib/calendar.ts';
	import { upcomingQuarters, whenMode, type TripWhen, type WhenMode } from '#lib/when.ts';
	import DateRangePicker from './DateRangePicker.svelte';

	let { when, today }: { when?: TripWhen; today: string } = $props();

	// Starts from the saved trip; the parent re-creates this component when the trip changes.
	const initial = untrack(() => when ?? { startDate: null, endDate: null, plannedPeriod: null });
	let mode = $state<WhenMode>(untrack(() => (when ? whenMode(when) : 'exact')));
	let start = $state(initial.startDate);
	let end = $state(initial.endDate);
	let month = $state(
		initial.plannedPeriod && !initial.plannedPeriod.includes('Q') ? initial.plannedPeriod : null
	);
	let quarter = $state(initial.plannedPeriod?.includes('Q') ? initial.plannedPeriod : null);

	const MODES: [WhenMode, string][] = [
		['exact', 'Dates'],
		['month', 'Month'],
		['quarter', 'Quarter'],
		['none', 'Not decided']
	];

	// Keep an older month or quarter selectable when editing a past trip.
	const withCurrent = (list: string[], current: string | null) =>
		current && !list.includes(current) ? [current, ...list] : list;
	const months = $derived(withCurrent(upcomingMonths(today, 12), month));
	const quarters = $derived(withCurrent(upcomingQuarters(today, 8), quarter));

	const monthParts = (m: string) => {
		const d = new Date(`${m}-15T12:00:00Z`);
		return {
			name: d.toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' }),
			year: m.slice(0, 4)
		};
	};
	const quarterMonths = (q: string) => {
		const first = (Number(q.slice(-1)) - 1) * 3;
		return [0, 2]
			.map((i) =>
				new Date(Date.UTC(2000, first + i, 15)).toLocaleDateString(undefined, {
					month: 'short',
					timeZone: 'UTC'
				})
			)
			.join(' – ');
	};

	const chip = (selected: boolean) => [
		'flex flex-col items-start rounded-xl border p-3 text-left',
		selected
			? 'border-blue-900 ring-1 ring-blue-900 dark:border-blue-300 dark:ring-blue-300'
			: 'border-slate-300 hover:border-slate-500 dark:border-slate-600'
	];
</script>

<fieldset class="col-span-full space-y-3">
	<legend class="mb-2 text-sm">When</legend>
	<div class="flex rounded-full bg-slate-100 p-1 dark:bg-slate-900" role="tablist">
		{#each MODES as [value, label] (value)}
			<button
				type="button"
				role="tab"
				aria-selected={mode === value}
				onclick={() => (mode = value)}
				class={[
					'flex-1 rounded-full px-2 py-1.5 text-sm font-medium',
					mode === value
						? 'bg-white shadow-sm dark:bg-slate-700'
						: 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
				]}
			>
				{label}
			</button>
		{/each}
	</div>
	<input type="hidden" name="when" value={mode} />

	{#if mode === 'exact'}
		<DateRangePicker
			bind:start
			bind:end
			{today}
			min={when ? undefined : today}
			startLabel="Leave"
			endLabel="Return"
		/>
	{:else if mode === 'month'}
		<p class="text-sm text-slate-500 dark:text-slate-400">Which month are you thinking of?</p>
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
			{#each months as m (m)}
				{@const p = monthParts(m)}
				<button type="button" class={chip(month === m)} onclick={() => (month = m)}>
					<span class="text-lg" aria-hidden="true">🗓️</span>
					<span class="font-medium">{p.name}</span>
					<span class="text-xs text-slate-500 dark:text-slate-400">{p.year}</span>
				</button>
			{/each}
		</div>
		<input type="hidden" name="month" value={month ?? ''} />
	{:else if mode === 'quarter'}
		<p class="text-sm text-slate-500 dark:text-slate-400">Roughly when in the year?</p>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{#each quarters as q (q)}
				<button type="button" class={chip(quarter === q)} onclick={() => (quarter = q)}>
					<span class="font-medium">Q{q.slice(-1)} {q.slice(0, 4)}</span>
					<span class="text-xs text-slate-500 dark:text-slate-400">{quarterMonths(q)}</span>
				</button>
			{/each}
		</div>
		<input type="hidden" name="quarter" value={quarter ?? ''} />
	{:else}
		<p class="text-sm text-slate-500 dark:text-slate-400">
			No problem. You can add dates once you know them.
		</p>
	{/if}
</fieldset>
