<script lang="ts">
	import { LOCALE } from '#lib/format.ts';
	import { onMount } from 'svelte';
	import { daysBetween, isWet, type DayWeather } from '#lib/climate.ts';
	import type { Gantt, GanttBar } from '#lib/gantt.ts';

	let {
		gantt,
		tripStart = null,
		undated = false,
		weather = new Map()
	}: {
		gantt: Gantt;
		tripStart?: string | null;
		undated?: boolean;
		/** Each day's weather, shown under the date so plans can follow the sun. */
		weather?: Map<string, DayWeather>;
	} = $props();

	const n = $derived(gantt.days.length);
	// Room for a weather line under the dates.
	const tall = $derived(!undated && gantt.days.some((d) => weather.has(d)));
	const pct = (x: number) => `${(x / n) * 100}%`;

	// "Now" marker, placed in the browser so it uses the device's clock.
	let now = $state<number | null>(null);
	onMount(() => {
		const tick = () => {
			const d = new Date();
			const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			const x = daysBetween(gantt.days[0], today) + (d.getHours() * 60 + d.getMinutes()) / 1440;
			now = x >= 0 && x <= n ? x : null;
		};
		if (undated) return;
		tick();
		const t = setInterval(tick, 60_000);
		return () => clearInterval(t);
	});

	const STYLES: Record<GanttBar['kind'], string> = {
		flight: 'bg-sky-500 text-white',
		stay: 'bg-slate-600 text-white',
		car: 'bg-runway text-ink-950',
		transport: 'bg-teal-500 text-white',
		restaurant: 'bg-rose-500 text-white',
		other: 'bg-emerald-600 text-white'
	};
	const weekday = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short' });
	const dayOfMonth = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
	const nights = (b: GanttBar) => Math.round(b.end - b.start);
	const clock = (x: number) => {
		const m = Math.round((x - Math.floor(x)) * 1440);
		return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	};

	function jump(target: string) {
		const el = document.getElementById(`entry-${target}`);
		if (!el) return;
		const list = el.closest('details');
		if (list) list.open = true;
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		el.classList.remove('flash');
		void el.offsetWidth;
		el.classList.add('flash');
	}
	let order = 0;
	const delay = () => `${(order++ % 30) * 45}ms`;
</script>

<div class="-mx-4 [scrollbar-width:thin] overflow-x-auto px-4 pb-2">
	<div class="relative" style="min-width: {n * 150}px">
		<!-- Day columns with night shading, so you can see days and nights pass. -->
		<div class={['absolute inset-0 flex', tall ? 'top-16' : 'top-12']} aria-hidden="true">
			{#each gantt.days as d, i (d)}
				<div
					class={[
						'h-full flex-1 border-l border-slate-200 dark:border-slate-700',
						'bg-[linear-gradient(to_right,rgb(30_45_99/0.10)_0%,rgb(30_45_99/0.02)_25%,transparent_30%,transparent_75%,rgb(30_45_99/0.02)_80%,rgb(30_45_99/0.10)_100%)]',
						'dark:bg-[linear-gradient(to_right,rgb(0_0_0/0.35)_0%,rgb(0_0_0/0.1)_25%,transparent_30%,transparent_75%,rgb(0_0_0/0.1)_80%,rgb(0_0_0/0.35)_100%)]',
						i === gantt.days.length - 1 && 'border-r'
					]}
				>
					<div
						class="ml-[50%] h-full border-l border-dashed border-slate-200/70 dark:border-slate-700/60"
					></div>
				</div>
			{/each}
		</div>

		<!-- Day headers -->
		<div class={['relative flex', tall ? 'h-16' : 'h-12']}>
			{#each gantt.days as d (d)}
				{@const num = tripStart ? daysBetween(tripStart, d) + 1 : null}
				<div class="flex-1 pl-2">
					{#if undated}
						<div class="font-mono text-[10px] font-bold tracking-wider text-runway uppercase">
							Day
						</div>
						<div class="text-lg leading-tight font-bold">{num}</div>
					{:else}
						<div class="font-mono text-[10px] font-bold tracking-wider text-runway uppercase">
							{num !== null && num > 0 ? `Day ${num}` : ' '}
						</div>
						<div class="text-sm leading-tight font-semibold">{weekday(d)}</div>
						<div class="text-xs text-slate-500 dark:text-slate-400">{dayOfMonth(d)}</div>
						{@const w = weather.get(d)}
						{#if w}
							<div
								class={[
									'mt-0.5 text-xs whitespace-nowrap tabular-nums',
									isWet(w)
										? 'font-semibold text-sky-700 dark:text-sky-300'
										: 'text-slate-600 dark:text-slate-300'
								]}
								title="{w.summary}{w.typical ? ' (typical)' : ''}"
							>
								{w.icon}
								{w.maxC}°
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		</div>

		{#each gantt.lanes as lane (lane.name)}
			<div class="relative mt-2">
				<div
					class="sticky left-0 z-10 inline-block rounded bg-white/80 px-1.5 font-mono text-[10px] font-bold tracking-wider text-slate-500 uppercase backdrop-blur dark:bg-ink-900/80 dark:text-slate-400"
				>
					{lane.name}
				</div>
				{#each lane.rows as row, r (r)}
					<div class="relative h-9">
						{#each row as bar (bar.key)}
							{#if bar.point}
								<!-- Near the right edge the label goes on the marker's left so it stays visible. -->
								{@const flip = bar.start > n - 0.85}
								<button
									type="button"
									onclick={() => jump(bar.target)}
									title="{bar.label}{bar.sub ? ` · ${bar.sub}` : ''}"
									class={[
										'group absolute top-1 flex animate-[pop_0.4s_ease-out_both] items-center gap-1.5 whitespace-nowrap',
										flip && 'flex-row-reverse text-right'
									]}
									style="{flip ? 'right' : 'left'}: {pct(
										flip ? n - bar.start : bar.start
									)}; margin-{flip ? 'right' : 'left'}: -14px; animation-delay: {delay()}"
								>
									<span
										class={[
											'flex size-7 shrink-0 items-center justify-center rounded-full text-sm shadow ring-2 ring-white transition group-hover:scale-110 dark:ring-ink-900',
											STYLES[bar.kind],
											bar.idea && 'ring-dashed opacity-60'
										]}>{bar.icon}</span
									>
									<span class={['leading-tight', flip ? 'text-right' : 'text-left']}>
										<span class="block max-w-28 truncate text-xs font-semibold">{bar.label}</span>
										<span class="block font-mono text-[10px] text-slate-500 dark:text-slate-400"
											>{bar.approximate ? '~' : ''}{clock(bar.start)}{bar.idea
												? ' · idea'
												: ''}</span
										>
									</span>
								</button>
							{:else}
								<button
									type="button"
									onclick={() => jump(bar.target)}
									title={bar.label}
									class={[
										'absolute top-1 flex h-7 origin-left animate-[grow_0.7s_cubic-bezier(0.2,0.7,0.2,1)_both] items-center gap-1.5 overflow-hidden rounded-full px-2 text-xs font-semibold shadow-sm transition hover:brightness-110',
										STYLES[bar.kind],
										bar.idea && 'opacity-60'
									]}
									style="left: {pct(bar.start)}; width: {pct(
										bar.end - bar.start
									)}; animation-delay: {delay()}"
								>
									<span aria-hidden="true">{bar.icon}</span>
									<span class="truncate">{bar.label}</span>
									{#if bar.kind === 'stay' && nights(bar) > 0}
										<span class="ml-auto shrink-0 opacity-80"
											>{'🌙'.repeat(Math.min(nights(bar), 7))}</span
										>
									{/if}
								</button>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		{/each}

		{#if now !== null}
			<div
				class="pointer-events-none absolute top-10 bottom-0 w-0.5 bg-runway shadow-[0_0_8px_var(--color-runway)]"
				style="left: {pct(now)}"
			>
				<span
					class="absolute -top-1 -translate-x-1/2 rounded bg-runway px-1 font-mono text-[9px] font-bold text-ink-950"
					>NOW</span
				>
			</div>
		{/if}
	</div>
</div>

<style>
	@keyframes -global-grow {
		from {
			transform: scaleX(0);
			opacity: 0;
		}
	}
	@keyframes -global-pop {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
	}
	:global(.flash) {
		animation: flash 1.4s ease-out;
	}
	@keyframes -global-flash {
		0%,
		30% {
			box-shadow: 0 0 0 3px var(--color-runway);
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
		}
	}
</style>
