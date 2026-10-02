<script lang="ts">
	import { LOCALE } from '#lib/format.ts';
	import { isWet, weatherHeadline, type TripWeather } from '#lib/climate.ts';

	let { weather, place }: { weather: TripWeather; place: string } = $props();

	const weekday = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short' });
	const dayOfMonth = (date: string) =>
		new Date(`${date}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
	const monthLabel = (month: string) =>
		new Date(`${month}-15T12:00:00`).toLocaleDateString(LOCALE, { month: 'long' });
	const headline = $derived(weatherHeadline(weather));
	// Warm days glow, cold ones cool down: easier to scan than numbers alone.
	const tone = (maxC: number) =>
		maxC >= 28
			? 'from-amber-200/80 to-orange-100/60 dark:from-amber-500/25 dark:to-orange-500/10'
			: maxC >= 20
				? 'from-amber-100/80 to-yellow-50/60 dark:from-amber-400/15 dark:to-yellow-400/5'
				: maxC >= 10
					? 'from-sky-100/80 to-slate-50/60 dark:from-sky-400/15 dark:to-slate-400/5'
					: 'from-indigo-100/80 to-sky-50/60 dark:from-indigo-400/20 dark:to-sky-400/5';
</script>

<section class="card scroll-mt-20" id="weather">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
		<h2 class="text-lg font-semibold">{weather.title} in {place}</h2>
		{#if headline}
			<span class="text-sm font-medium text-slate-600 dark:text-slate-300">{headline}</span>
		{/if}
	</div>
	{#if weather.kind !== 'unavailable' && weather.note}
		<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{weather.note}</p>
	{/if}

	{#if weather.kind === 'unavailable'}
		<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
			The weather is unavailable right now.
		</p>
	{:else if weather.kind === 'days'}
		<ul
			class="-mx-1 mt-3 flex snap-x [scrollbar-width:thin] gap-2 overflow-x-auto px-1 pb-1"
			aria-label="Day by day"
		>
			{#each weather.days as day (day.date)}
				<li
					class={[
						'flex w-[4.5rem] shrink-0 snap-start flex-col items-center rounded-2xl bg-linear-to-b px-1 py-2 text-center',
						tone(day.maxC),
						isWet(day) && 'ring-2 ring-sky-400/70 dark:ring-sky-400/50',
						day.typical && 'opacity-80'
					]}
					title={day.summary}
				>
					<span class="text-xs font-semibold">{weekday(day.date)}</span>
					<span class="text-[11px] text-slate-500 dark:text-slate-400">{dayOfMonth(day.date)}</span>
					<span class="my-1 text-3xl leading-none" aria-label={day.summary}>{day.icon}</span>
					<span class="text-base font-bold tabular-nums">{day.maxC}°</span>
					<span class="text-xs text-slate-500 tabular-nums dark:text-slate-400">{day.minC}°</span>
					{#if day.rainChance !== null}
						<span
							class={[
								'mt-0.5 text-[11px] tabular-nums',
								isWet(day)
									? 'font-semibold text-sky-700 dark:text-sky-300'
									: 'text-slate-500 dark:text-slate-400'
							]}>💧{day.rainChance}%</span
						>
					{/if}
					{#if day.typical}
						<span class="text-[9px] tracking-wide text-slate-500 uppercase dark:text-slate-400"
							>typical</span
						>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="mt-3 grid gap-2 sm:grid-cols-3">
			{#each weather.months as m (m.month)}
				<li class={['flex items-center gap-3 rounded-2xl bg-linear-to-b p-3', tone(m.maxC)]}>
					<div class="text-center">
						<div class="text-2xl font-bold tabular-nums">{m.maxC}°</div>
						<div class="text-xs text-slate-500 tabular-nums dark:text-slate-400">
							{m.minC}° at night
						</div>
					</div>
					<div class="min-w-0 text-sm">
						<div class="font-semibold">{monthLabel(m.month)}</div>
						<div class="text-sky-700 dark:text-sky-300">
							💧 Rain on about {m.rainyDays} of {m.daysInMonth} days
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="mt-2 text-xs text-slate-400 dark:text-slate-500">
		Weather by <a class="underline" href="https://open-meteo.com/">Open-Meteo</a>. The AI planner
		uses it too.
	</p>
</section>
