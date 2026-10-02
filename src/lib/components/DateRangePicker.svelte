<script lang="ts">
	import { LOCALE } from '#lib/format.ts';
	import { untrack } from 'svelte';
	import { monthGrid, nights, pickDate, shiftMonth } from '#lib/calendar.ts';

	let {
		start = $bindable(null),
		end = $bindable(null),
		today,
		min,
		startLabel = 'Check-in',
		endLabel = 'Check-out',
		startName = 'startDate',
		endName = 'endDate',
		openAt
	}: {
		start?: string | null;
		end?: string | null;
		today: string;
		/** Days before this can't be picked. */
		min?: string;
		startLabel?: string;
		endLabel?: string;
		startName?: string;
		endName?: string;
		/** Date whose month the calendar opens on when nothing is picked yet. */
		openAt?: string | null;
	} = $props();

	// The calendar opens on the chosen check-in, then `openAt`, then this month.
	let view = $state(untrack(() => (start ?? openAt ?? today).slice(0, 7)));
	let hovered = $state<string | null>(null);

	const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

	const monthTitle = (month: string) =>
		new Date(`${month}-15T12:00:00Z`).toLocaleDateString(LOCALE, {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});
	const short = (date: string) =>
		new Date(`${date}T12:00:00Z`).toLocaleDateString(LOCALE, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
	const full = (date: string) =>
		new Date(`${date}T12:00:00Z`).toLocaleDateString(LOCALE, {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		});

	// While choosing check-out, preview the range up to the hovered day.
	const rangeEnd = $derived(end ?? (start && hovered && hovered > start ? hovered : null));

	function pick(date: string) {
		({ start, end } = pickDate({ start, end }, date));
	}

	function cellState(date: string) {
		const isStart = date === start;
		const isEnd = date === end;
		const inRange = !!start && !!rangeEnd && date > start && date < rangeEnd;
		const isRangeEnd = !end && date === rangeEnd;
		return { isStart, isEnd, inRange, isRangeEnd, disabled: !!min && date < min };
	}
</script>

<div class="space-y-3">
	<div
		class="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-300 dark:border-slate-600"
	>
		<div class="p-2 px-3">
			<div class="text-[11px] font-semibold tracking-wide uppercase">{startLabel}</div>
			<div class={start ? '' : 'text-slate-400 dark:text-slate-500'}>
				{start ? short(start) : 'Add date'}
			</div>
		</div>
		<div class="border-l border-slate-300 p-2 px-3 dark:border-slate-600">
			<div class="text-[11px] font-semibold tracking-wide uppercase">{endLabel}</div>
			<div class={end ? '' : 'text-slate-400 dark:text-slate-500'}>
				{end ? short(end) : 'Add date'}
			</div>
		</div>
	</div>

	<div class="relative">
		<div class="absolute inset-x-0 top-0 flex justify-between">
			<button
				type="button"
				onclick={() => (view = shiftMonth(view, -1))}
				class="rounded-full p-1.5 px-3 hover:bg-slate-100 dark:hover:bg-slate-700"
				aria-label="Previous month">‹</button
			>
			<button
				type="button"
				onclick={() => (view = shiftMonth(view, 1))}
				class="rounded-full p-1.5 px-3 hover:bg-slate-100 dark:hover:bg-slate-700"
				aria-label="Next month">›</button
			>
		</div>

		<div class="grid gap-6 sm:grid-cols-2">
			{#each [view, shiftMonth(view, 1)] as month, i (month)}
				<div class={i === 1 ? 'hidden sm:block' : ''}>
					<div class="mb-2 py-1.5 text-center font-semibold">{monthTitle(month)}</div>
					<table class="w-full table-fixed border-collapse text-sm" role="grid">
						<thead>
							<tr>
								{#each WEEKDAYS as wd (wd)}
									<th class="pb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{wd}</th>
								{/each}
							</tr>
						</thead>
						<tbody onmouseleave={() => (hovered = null)}>
							{#each monthGrid(month) as week, w (w)}
								<tr>
									{#each week as date, d (d)}
										<td class="p-0">
											{#if date}
												{@const s = cellState(date)}
												{@const edge = s.isStart || s.isEnd || s.isRangeEnd}
												{@const band = !!start && !!rangeEnd && start !== rangeEnd}
												<div
													class={[
														'flex h-10 items-center justify-center',
														s.inRange && 'bg-slate-100 dark:bg-slate-700',
														band &&
															s.isStart &&
															'bg-linear-to-r from-transparent from-50% to-slate-100 to-50% dark:to-slate-700',
														band &&
															(s.isEnd || s.isRangeEnd) &&
															'bg-linear-to-l from-transparent from-50% to-slate-100 to-50% dark:to-slate-700'
													]}
												>
													<button
														type="button"
														disabled={s.disabled}
														onclick={() => pick(date)}
														onmouseenter={() => (hovered = date)}
														aria-label={full(date)}
														aria-pressed={s.isStart || s.isEnd}
														class={[
															'h-10 w-10 rounded-full tabular-nums',
															s.disabled
																? 'cursor-not-allowed text-slate-300 line-through dark:text-slate-600'
																: edge
																	? 'bg-blue-900 font-semibold text-white dark:bg-blue-300 dark:text-slate-900'
																	: 'hover:ring-1 hover:ring-slate-900 dark:hover:ring-slate-100',
															date === today && !edge && 'font-bold underline'
														]}
													>
														{Number(date.slice(8))}
													</button>
												</div>
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</div>
	</div>

	<div class="flex items-center justify-between text-sm">
		<span class="text-slate-500 dark:text-slate-400">
			{#if start && end}
				{nights(start, end) === 0
					? 'Day trip'
					: `${nights(start, end)} night${nights(start, end) === 1 ? '' : 's'}`}
			{:else if start}
				Now pick the {endLabel.toLowerCase()} date
			{:else}
				Pick the {startLabel.toLowerCase()} date
			{/if}
		</span>
		{#if start}
			<button
				type="button"
				onclick={() => ((start = null), (end = null))}
				class="font-medium underline">Clear dates</button
			>
		{/if}
	</div>

	<input type="hidden" name={startName} value={start ?? ''} />
	<input type="hidden" name={endName} value={end ?? start ?? ''} />
</div>
