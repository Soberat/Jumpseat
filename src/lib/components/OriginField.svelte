<script lang="ts">
	import { AIRPORTS, airportByCode } from '#lib/airports.ts';
	import { DEFAULT_HOME } from '#lib/trip-route.ts';

	let { value = null }: { value?: string | null } = $props();
	const home = airportByCode(DEFAULT_HOME)!;
	const current = $derived(value ? airportByCode(value) : null);
</script>

<label class="flex flex-col gap-1 text-sm sm:col-span-2">
	Starting from
	<input
		name="origin"
		list="origin-airports"
		autocomplete="off"
		value={current ? `${current.code} · ${current.city}` : ''}
		placeholder="{home.city} ({home.code})"
	/>
	<span class="text-xs text-slate-500 dark:text-slate-400"
		>Leave empty to start from {home.city}.</span
	>
	<datalist id="origin-airports">
		{#each AIRPORTS as a (a.code)}
			<option value="{a.code} · {a.city}"></option>
		{/each}
	</datalist>
</label>
