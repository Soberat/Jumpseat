<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Sight } from '#lib/sights.ts';

	let {
		sights,
		place,
		planned
	}: {
		sights: Promise<Sight[]>;
		place: string;
		/** Titles already on the timeline, so added sights drop off the list. */
		planned: string[];
	} = $props();

	const plannedSet = $derived(new Set(planned.map((t) => t.toLowerCase())));
	let showAll = $state(false);
</script>

<section class="card space-y-3">
	<h2 class="text-lg font-semibold">Things to do in {place}</h2>
	{#await sights}
		<p class="text-sm text-slate-500 dark:text-slate-400">Looking for sights nearby…</p>
	{:then all}
		{@const open = all.filter((s) => !plannedSet.has(s.title.toLowerCase()))}
		{#if open.length === 0}
			<p class="text-sm text-slate-500 dark:text-slate-400">
				{all.length === 0
					? 'No suggestions right now. They need an internet connection on the server.'
					: 'Everything suggested is already on your timeline.'}
			</p>
		{:else}
			<ul class="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
				{#each showAll ? open : open.slice(0, 6) as s (s.title)}
					<li
						class="flex min-w-0 gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
					>
						{#if s.thumbnail}
							<img
								src={s.thumbnail}
								alt=""
								loading="lazy"
								class="size-16 shrink-0 rounded-md object-cover"
							/>
						{:else}
							<div
								class="flex size-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-2xl dark:bg-slate-700"
								aria-hidden="true"
							>
								📍
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<a
								href={s.url}
								target="_blank"
								rel="noopener noreferrer"
								class="font-medium break-words hover:underline">{s.title}</a
							>
							<p class="truncate text-sm text-slate-500 dark:text-slate-400">
								{[s.description, `${s.distanceKm} km away`].filter(Boolean).join(' · ')}
							</p>
							<form method="POST" action="?/addItem" use:enhance class="mt-1">
								<input type="hidden" name="kind" value="other" />
								<input type="hidden" name="status" value="idea" />
								<input type="hidden" name="title" value={s.title} />
								<input type="hidden" name="url" value={s.url} />
								{#if s.description}<input type="hidden" name="notes" value={s.description} />{/if}
								<button
									class="min-h-8 text-sm font-medium text-blue-900 hover:underline dark:text-blue-300"
								>
									+ Add as idea
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
			{#if open.length > 6}
				<button
					type="button"
					onclick={() => (showAll = !showAll)}
					class="min-h-8 text-sm text-blue-900 hover:underline dark:text-blue-300"
				>
					{showAll ? 'Show fewer' : `Show ${open.length - 6} more`}
				</button>
			{/if}
			<p class="text-xs text-slate-400 dark:text-slate-500">From Wikipedia, most-read first.</p>
		{/if}
	{/await}
</section>
