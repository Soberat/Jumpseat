<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { TimelineItem } from '#lib/server/db/schema.ts';
	import {
		itemIcon,
		MODE_LABELS,
		transportTitle,
		type Timeline,
		type TimelineEntry
	} from '#lib/timeline.ts';

	let {
		timeline,
		extra,
		itemExtra
	}: {
		timeline: Timeline;
		/** Rendered under each entry, e.g. standby loads and remove buttons. */
		extra?: Snippet<[TimelineEntry]>;
		/** Rendered under each unscheduled item. */
		itemExtra?: Snippet<[TimelineItem]>;
	} = $props();

	const dayLabel = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
			weekday: 'long',
			day: 'numeric',
			month: 'long'
		});

	function details(item: TimelineItem, phase: 'start' | 'end' | 'single'): string[] {
		const parts: string[] = [];
		if (item.kind === 'transport') {
			// Untitled legs already got "Taxi · A → B" as their title; don't repeat it.
			const autoTitled = item.title === transportTitle(item.mode, item.fromPlace, item.toPlace);
			if (!autoTitled && item.mode) parts.push(MODE_LABELS[item.mode]);
			if (!autoTitled && (item.fromPlace || item.toPlace))
				parts.push([item.fromPlace, item.toPlace].filter(Boolean).join(' → '));
		} else if (item.location) {
			parts.push(item.location);
		}
		if (phase === 'start' && item.endDate && item.endDate !== item.startDate) {
			parts.push(`until ${dayLabel(item.endDate)}`);
		}
		if (item.reference) parts.push(`Ref ${item.reference}`);
		return parts;
	}
</script>

{#snippet itemBody(item: TimelineItem, phase: 'start' | 'end' | 'single', label: string | null)}
	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-baseline gap-x-2">
			{#if label}
				<span
					class="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
					>{label}</span
				>
			{/if}
			<span class="font-medium">{item.title}</span>
			{#if item.status === 'idea'}
				<span
					class="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
				>
					idea
				</span>
			{/if}
		</div>
		{#if details(item, phase).length > 0}
			<div class="text-sm text-slate-500 dark:text-slate-400">
				{details(item, phase).join(' · ')}
			</div>
		{/if}
		{#if item.url}
			<a
				href={item.url}
				target="_blank"
				rel="noopener noreferrer"
				class="text-sm text-blue-900 underline dark:text-blue-300">Link</a
			>
		{/if}
		{#if item.notes}
			<p class="mt-1 text-sm whitespace-pre-line">{item.notes}</p>
		{/if}
	</div>
{/snippet}

{#if timeline.days.length === 0 && timeline.unscheduled.length === 0}
	<p class="text-sm text-slate-500 dark:text-slate-400">Nothing planned yet.</p>
{/if}

<ol class="space-y-5">
	{#each timeline.days as day (day.date)}
		<li>
			<h3 class="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
				{dayLabel(day.date)}
			</h3>
			<ul class="space-y-2 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
				{#each day.entries as entry (entry.key)}
					<li class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
						<div class="flex gap-3">
							<div class="w-12 shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400">
								{entry.time ?? ''}
							</div>
							<div class="text-xl leading-6" aria-hidden="true">
								{entry.type === 'flight' ? '✈️' : itemIcon(entry.item)}
							</div>
							{#if entry.type === 'flight'}
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-baseline gap-x-2">
										<span class="font-mono font-semibold">{entry.flight.flightNumber}</span>
										<span>{entry.flight.origin} → {entry.flight.destination}</span>
										{#if entry.flight.standby}
											<span
												class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
											>
												standby
											</span>
										{/if}
									</div>
								</div>
							{:else}
								{@render itemBody(entry.item, entry.phase, entry.phaseLabel)}
							{/if}
						</div>
						{@render extra?.(entry)}
					</li>
				{/each}
			</ul>
		</li>
	{/each}
</ol>

{#if timeline.unscheduled.length > 0}
	<div>
		<h3 class="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Not scheduled yet</h3>
		<ul class="space-y-2">
			{#each timeline.unscheduled as item (item.id)}
				<li class="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
					<div class="flex gap-3">
						<div class="text-xl leading-6" aria-hidden="true">{itemIcon(item)}</div>
						{@render itemBody(item, 'single', null)}
					</div>
					{@render itemExtra?.(item)}
				</li>
			{/each}
		</ul>
	</div>
{/if}
