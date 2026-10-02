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
	import { daysBetween } from '#lib/climate.ts';
	import { reveal } from '#lib/reveal.ts';
	import Plane from './Plane.svelte';

	let {
		timeline,
		extra,
		itemExtra,
		tripStart = null
	}: {
		timeline: Timeline;
		/** When set, days are labelled "Day 1", "Day 2"… */
		tripStart?: string | null;
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

<ol class="relative space-y-6">
	{#if timeline.days.length > 0}
		<!-- The route line every day hangs off. -->
		<span
			class="absolute top-3 bottom-3 left-[11px] w-0.5 rounded-full bg-linear-to-b from-runway via-sky-400 to-violet-500 opacity-70"
			aria-hidden="true"
		></span>
	{/if}
	{#each timeline.days as day (day.date)}
		{@const dayNumber = tripStart ? daysBetween(tripStart, day.date) + 1 : null}
		<li class="relative pl-9">
			<span
				class="absolute top-0.5 left-0 flex size-6 items-center justify-center rounded-full bg-runway font-mono text-[10px] font-bold text-ink-950 ring-4 ring-white dark:ring-ink-900"
				aria-hidden="true">{dayNumber !== null && dayNumber > 0 ? dayNumber : '•'}</span
			>
			<h3 class="mb-2 flex items-baseline gap-2 text-sm font-semibold">
				{#if dayNumber !== null && dayNumber > 0}
					<span class="font-mono text-xs tracking-wider text-runway uppercase">Day {dayNumber}</span
					>
				{/if}
				<span class="text-slate-500 dark:text-slate-400">{dayLabel(day.date)}</span>
			</h3>
			<ul class="space-y-2">
				{#each day.entries as entry, i (entry.key)}
					<li
						use:reveal={i * 60}
						class={[
							'rounded-xl border p-3 transition hover:shadow-sm',
							entry.type === 'flight'
								? 'border-sky-200 bg-linear-to-r from-sky-50 to-white dark:border-sky-900 dark:from-sky-950/60 dark:to-ink-900'
								: 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-ink-900/40'
						]}
					>
						<div class="flex gap-3">
							<div
								class="w-12 shrink-0 font-mono text-sm text-slate-500 tabular-nums dark:text-slate-400"
							>
								{entry.time ?? ''}
							</div>
							{#if entry.type === 'flight'}
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<span class="font-mono text-lg font-bold">{entry.flight.origin}</span>
										<span class="relative h-4 w-16 sm:w-24" aria-hidden="true">
											<span
												class="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-sky-300 dark:border-sky-700"
											></span>
											<span
												class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sky-600 dark:text-sky-300"
												><Plane /></span
											>
										</span>
										<span class="font-mono text-lg font-bold">{entry.flight.destination}</span>
									</div>
									<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
										<span class="font-mono text-slate-500 dark:text-slate-400"
											>{entry.flight.flightNumber}</span
										>
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
								<div class="text-xl leading-6" aria-hidden="true">{itemIcon(entry.item)}</div>
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
