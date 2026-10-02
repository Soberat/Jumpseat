<script lang="ts">
	import { untrack } from 'svelte';
	import type { TripStop } from '#lib/trip-route.ts';

	let { stops = [] }: { stops?: TripStop[] } = $props();

	// Places after the destination, in order. Each gets its own input named "stop".
	let names = $state(untrack(() => stops.map((s) => s.name)));
</script>

<div class="flex flex-col gap-1 text-sm sm:col-span-2">
	{#if names.length}
		<span>Then on to</span>
		<ol class="space-y-2">
			{#each names, i}
				<li class="flex items-center gap-2">
					<span class="w-5 text-right font-mono text-xs text-slate-500 dark:text-slate-400"
						>{i + 2}.</span
					>
					<input
						name="stop"
						bind:value={names[i]}
						placeholder={['Sydney', 'Singapore', 'Tokyo'][i % 3]}
						aria-label="Stop {i + 2}"
						class="min-w-0 flex-1"
					/>
					<button
						type="button"
						onclick={() => names.splice(i, 1)}
						class="min-h-8 min-w-8 px-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
						aria-label="Remove stop {i + 2}">×</button
					>
				</li>
			{/each}
		</ol>
	{/if}
	<button
		type="button"
		onclick={() => names.push('')}
		class="self-start text-blue-900 hover:underline dark:text-blue-300"
	>
		+ {names.length ? 'Add another stop' : 'Going on somewhere else after? Add a stop'}
	</button>
</div>
