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
		tripStart = null,
		undated = false
	}: {
		timeline: Timeline;
		/** When set, days are labelled "Day 1", "Day 2"… */
		tripStart?: string | null;
		/** The trip has no dates yet: days are "Day 1", "Day 2"… with no calendar dates. */
		undated?: boolean;
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

	const minutesOf = (t: string) => {
		const [h, m] = t.split(':').map(Number);
		return h * 60 + (m || 0);
	};

	function details(item: TimelineItem, phase: 'start' | 'end' | 'single'): string[] {
		const parts: string[] = [];
		if (item.kind === 'transport') {
			// Untitled legs already got "Taxi · A → B" as their title; don't repeat it.
			const autoTitled = item.title === transportTitle(item.mode, item.fromPlace, item.toPlace);
			if (!autoTitled && item.mode) parts.push(MODE_LABELS[item.mode]);
			// With both ends known the route is drawn instead (see `visual`).
			if (!autoTitled && (item.fromPlace || item.toPlace) && !(item.fromPlace && item.toPlace))
				parts.push([item.fromPlace, item.toPlace].filter(Boolean).join(' → '));
		} else if (item.location) {
			parts.push(item.location);
		}
		if (phase === 'start' && item.endDate && item.endDate !== item.startDate) {
			parts.push(
				undated && tripStart
					? `until day ${daysBetween(tripStart, item.endDate) + 1}`
					: `until ${dayLabel(item.endDate)}`
			);
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

{#snippet visual(item: TimelineItem, phase: 'start' | 'end' | 'single')}
	{@const nights = item.endDate && item.startDate ? daysBetween(item.startDate, item.endDate) : 0}
	{#if item.kind === 'stay' && phase === 'start' && nights > 0}
		<div class="mt-1.5 flex items-center gap-1" aria-label="{nights} nights">
			{#each { length: Math.min(nights, 14) }, i (i)}
				<span
					class="size-3 rounded-full bg-indigo-400 shadow-[inset_-3px_-1px_0_0_theme(--color-indigo-200)] dark:bg-indigo-300 dark:shadow-[inset_-3px_-1px_0_0_theme(--color-ink-900)]"
				></span>
			{/each}
			<span class="ml-1 font-mono text-[11px] text-slate-500 dark:text-slate-400"
				>{nights} night{nights === 1 ? '' : 's'}</span
			>
		</div>
	{:else if item.kind === 'transport' && item.fromPlace && item.toPlace}
		<div class="mt-1.5 flex items-center gap-2 text-xs font-medium">
			<span class="max-w-[40%] truncate">{item.fromPlace}</span>
			<span class="relative h-4 min-w-12 flex-1" aria-hidden="true">
				<span
					class="absolute inset-x-0 top-1/2 border-t-2 border-dotted border-teal-400 dark:border-teal-600"
				></span>
				<span
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-1 text-sm dark:bg-ink-900"
					>{itemIcon(item)}</span
				>
			</span>
			<span class="max-w-[40%] truncate">{item.toPlace}</span>
		</div>
	{/if}
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
				{#if !undated}
					<span class="text-slate-500 dark:text-slate-400">{dayLabel(day.date)}</span>
				{/if}
			</h3>
			<ul class="space-y-2">
				{#each day.entries as entry, i (entry.key)}
					<li
						id="entry-{entry.key}"
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
								{#if entry.time}
									{@const at = minutesOf(entry.time) / 1440}
									<!-- Where in the day this happens: night, morning, afternoon, night. -->
									<span
										class="relative mt-1 block h-1.5 w-11 rounded-full bg-[linear-gradient(to_right,#1e2d63,#f6b23c_30%,#7dd3fc_50%,#f6b23c_75%,#1e2d63)] opacity-80"
										aria-hidden="true"
									>
										<span
											class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-slate-400"
											style="left: {at * 100}%"
										></span>
									</span>
								{/if}
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
								<div class="min-w-0 flex-1">
									{@render itemBody(entry.item, entry.phase, entry.phaseLabel)}
									{@render visual(entry.item, entry.phase)}
								</div>
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
