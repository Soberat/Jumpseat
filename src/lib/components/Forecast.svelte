<script lang="ts">
	import type { DailyForecast } from '#lib/weather.ts';

	let { days, place }: { days: DailyForecast[] | null; place: string } = $props();

	const weekday = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
			weekday: 'short',
			day: 'numeric'
		});
</script>

<section class="rounded-xl bg-white p-4 shadow-sm dark:bg-slate-800">
	<h2 class="mb-3 text-lg font-semibold">Weather in {place}</h2>
	{#if days === null}
		<p class="text-sm text-slate-500 dark:text-slate-400">The forecast is unavailable right now.</p>
	{:else}
		<ul class="grid grid-cols-4 gap-2 text-center sm:grid-cols-7">
			{#each days as day (day.date)}
				<li class="rounded-lg bg-slate-50 p-2 dark:bg-slate-900" title={day.summary}>
					<div class="text-xs text-slate-500 dark:text-slate-400">{weekday(day.date)}</div>
					<div class="text-2xl" aria-label={day.summary}>{day.icon}</div>
					<div class="text-sm font-medium">{day.maxC}° / {day.minC}°</div>
					{#if day.precipitationChance !== null}
						<div class="text-xs text-sky-700 dark:text-sky-300">💧 {day.precipitationChance}%</div>
					{/if}
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-slate-400 dark:text-slate-500">
			Forecast by <a class="underline" href="https://open-meteo.com/">Open-Meteo</a>
		</p>
	{/if}
</section>
