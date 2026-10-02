<script lang="ts">
	import { LOCALE } from '#lib/format.ts';
	import type { TripWeather } from '#lib/climate.ts';

	let { weather, place }: { weather: TripWeather; place: string } = $props();

	const dayLabel = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(LOCALE, {
			weekday: 'short',
			day: 'numeric'
		});
	const monthLabel = (month: string) =>
		new Date(`${month}-15T12:00:00`).toLocaleDateString(LOCALE, { month: 'long' });
</script>

<section class="card">
	<h2 class="text-lg font-semibold">{weather.title} in {place}</h2>
	{#if weather.kind !== 'unavailable' && weather.note}
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{weather.note}</p>
	{/if}

	{#if weather.kind === 'unavailable'}
		<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
			The weather is unavailable right now.
		</p>
	{:else if weather.kind === 'days'}
		<ul class="mt-3 grid grid-cols-4 gap-2 text-center sm:grid-cols-7">
			{#each weather.days as day (day.date)}
				<li
					class={[
						'rounded-lg p-2',
						day.typical
							? 'border border-dashed border-slate-300 dark:border-slate-600'
							: 'bg-slate-50 dark:bg-slate-900'
					]}
					title={day.summary}
				>
					<div class="text-xs text-slate-500 dark:text-slate-400">{dayLabel(day.date)}</div>
					<div class="text-2xl" aria-label={day.summary}>{day.icon}</div>
					<div class="text-sm font-medium">{day.maxC}° / {day.minC}°</div>
					{#if day.rainChance !== null}
						<div class="text-xs text-sky-700 dark:text-sky-300">💧 {day.rainChance}%</div>
					{/if}
					{#if day.typical}
						<div class="text-[10px] tracking-wide text-slate-400 uppercase dark:text-slate-500">
							typical
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="mt-3 grid gap-2 sm:grid-cols-3">
			{#each weather.months as m (m.month)}
				<li class="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
					<div class="font-medium">{monthLabel(m.month)}</div>
					<div class="text-sm">
						Highs around <strong>{m.maxC}°</strong>, lows around <strong>{m.minC}°</strong>
					</div>
					<div class="text-sm text-sky-700 dark:text-sky-300">
						💧 Rain on about {m.rainyDays} of {m.daysInMonth} days
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="mt-2 text-xs text-slate-400 dark:text-slate-500">
		Weather by <a class="underline" href="https://open-meteo.com/">Open-Meteo</a>
	</p>
</section>
