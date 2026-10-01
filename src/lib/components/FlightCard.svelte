<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Flight } from '#lib/server/db/schema.ts';

	let { flight, children }: { flight: Flight; children?: Snippet } = $props();
</script>

<li class="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<div>
			<span class="font-mono font-semibold">{flight.flightNumber}</span>
			<span class="ml-2">{flight.origin} → {flight.destination}</span>
			{#if flight.standby}
				<span
					class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
				>
					standby
				</span>
			{/if}
		</div>
		<div class="text-sm text-slate-500 dark:text-slate-400">
			{flight.departureDate}{flight.departureTime ? ` · ${flight.departureTime}` : ''}
		</div>
	</div>
	{@render children?.()}
</li>
