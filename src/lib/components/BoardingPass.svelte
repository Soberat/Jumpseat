<script lang="ts">
	import { countdown, placeHue } from '#lib/countdown.ts';
	import { describeWhen, type TripWhen } from '#lib/when.ts';
	import { daysBetween } from '#lib/climate.ts';
	import Plane from './Plane.svelte';

	let {
		id,
		title,
		when,
		today,
		from,
		to,
		toLabel,
		fromLabel,
		index = 0
	}: {
		id: string;
		title: string;
		when: TripWhen;
		today: string;
		from: string;
		to: string;
		fromLabel: string;
		toLabel: string;
		index?: number;
	} = $props();

	const board = $derived(countdown(when, today));
	const hue = $derived(placeHue(toLabel));
	const nights = $derived(
		when.startDate && when.endDate ? daysBetween(when.startDate, when.endDate) : null
	);
	// A decorative barcode, stable per trip.
	const bars = $derived.by(() => {
		let h = 0;
		for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
		return Array.from({ length: 22 }, (_, i) => {
			h = (h * 1103515245 + 12345) >>> 0;
			return { w: 1 + (h % 3), gap: i };
		});
	});
	const STATUS_STYLES = {
		upcoming: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
		travelling: 'bg-runway/20 text-amber-800 dark:text-runway',
		planning: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
		someday: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
		past: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
	};
</script>

<a
	href="/trips/{id}"
	class={[
		'group relative flex animate-rise overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:bg-ink-900 dark:ring-white/5',
		board.phase === 'past' && 'opacity-70 grayscale-[0.4]'
	]}
	style="--hue: {hue}; animation-delay: {index * 70}ms"
>
	<!-- Colour stripe: each destination gets its own hue. -->
	<span class="w-1.5 shrink-0 bg-[hsl(var(--hue)_75%_55%)]"></span>

	<div class="min-w-0 flex-1 p-4">
		<div class="flex items-center justify-between gap-2">
			<span class="font-mono text-[10px] font-semibold tracking-[0.2em] text-slate-400 uppercase"
				>Boarding pass</span
			>
			<span
				class={[
					'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider',
					STATUS_STYLES[board.phase]
				]}>{board.status}</span
			>
		</div>

		<div class="mt-2 flex items-center gap-3">
			<span class="font-mono text-3xl font-bold sm:text-4xl">{from}</span>
			<span class="relative h-6 flex-1" aria-hidden="true">
				<span
					class="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-slate-300 dark:border-slate-600"
				></span>
				<span
					class="absolute top-1/2 left-0 -translate-y-1/2 text-lg text-[hsl(var(--hue)_70%_45%)] transition-all duration-700 ease-out group-hover:left-[calc(100%-1.1rem)] dark:text-[hsl(var(--hue)_80%_65%)]"
					><Plane /></span
				>
			</span>
			<span
				class="font-mono text-3xl font-bold text-[hsl(var(--hue)_70%_40%)] sm:text-4xl dark:text-[hsl(var(--hue)_80%_68%)]"
				style="view-transition-name: trip-codes-{id}">{to}</span
			>
		</div>
		<div class="flex justify-between text-xs text-slate-500 dark:text-slate-400">
			<span>{fromLabel}</span><span>{toLabel}</span>
		</div>

		<div class="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
			<span class="font-mono text-[10px] tracking-wider text-slate-400 uppercase">Trip</span>
			<span class="font-mono text-[10px] tracking-wider text-slate-400 uppercase">
				{nights !== null ? 'Nights' : ''}
			</span>
			<span
				class="truncate font-display font-semibold"
				style="view-transition-name: trip-title-{id}">{title}</span
			>
			<span class="font-mono font-semibold">{nights ?? ''}</span>
			<span class="col-span-2 text-slate-500 dark:text-slate-400">{describeWhen(when)}</span>
		</div>
	</div>

	<!-- Tear-off stub with the countdown. -->
	<div
		class="relative flex w-24 shrink-0 flex-col items-center justify-center gap-1 border-l-2 border-dashed border-slate-200 bg-[hsl(var(--hue)_80%_96%)] px-2 py-3 text-center sm:w-32 dark:border-slate-700 dark:bg-[hsl(var(--hue)_40%_14%)]"
	>
		<span class="absolute -top-3 -left-3 size-6 rounded-full bg-paper dark:bg-ink-950"></span>
		<span class="absolute -bottom-3 -left-3 size-6 rounded-full bg-paper dark:bg-ink-950"></span>
		<span class="font-mono text-2xl leading-none font-bold sm:text-3xl">{board.big}</span>
		<span
			class="font-mono text-[9px] font-semibold tracking-wider text-slate-500 dark:text-slate-400"
			>{board.caption}</span
		>
		<svg
			viewBox="0 0 66 20"
			class="mt-1 h-5 w-16 text-slate-700 dark:text-slate-300"
			aria-hidden="true"
		>
			{#each bars as b, i (i)}
				<rect x={i * 3} width={b.w} height="20" fill="currentColor" />
			{/each}
		</svg>
	</div>
</a>
