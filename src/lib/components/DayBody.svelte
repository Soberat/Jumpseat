<script lang="ts">
	import type { TimelineItem } from '#lib/server/db/schema.ts';
	import { itemIcon } from '#lib/timeline.ts';
	import { clockOf, formatDuration } from '#lib/duration.ts';
	import type { DayRange, Gap, JourneyCard, PlacedCard } from '#lib/journey.ts';

	let {
		layout,
		range,
		height,
		zoomed = false,
		stay = null,
		target = null,
		draggingId = null,
		onpress,
		onresize,
		onselect
	}: {
		layout: { placed: PlacedCard[]; gaps: Gap[] };
		range: DayRange;
		/** Pixel height of the drawn range. */
		height: number;
		/** The by-the-minute view: taller, with lengths, resize handles and quarter-hour lines. */
		zoomed?: boolean;
		stay?: TimelineItem | null;
		/** Where a dragged card would land. */
		target?: { time: string | null; y: number; h: number } | null;
		draggingId?: string | null;
		onpress: (e: PointerEvent, card: JourneyCard) => void;
		onresize?: (e: PointerEvent, placed: PlacedCard, body: HTMLElement) => void;
		onselect: (card: JourneyCard) => void;
	} = $props();

	let body = $state<HTMLElement>();
	const span = $derived(range.end - range.start);
	const y = (m: number) => ((m - range.start) / span) * height;
	const hours = $derived(
		Array.from({ length: span / 60 + 1 }, (_, i) => range.start + i * 60).filter(
			(m) => zoomed || m % 180 === 0 || m === range.start
		)
	);
	const quarters = $derived(
		zoomed
			? Array.from({ length: span / 15 }, (_, i) => range.start + i * 15).filter((m) => m % 60)
			: []
	);
	const MIN_H = $derived(zoomed ? 24 : 26);

	const STRIPE: Record<string, string> = {
		flight: 'bg-sky-500',
		stay: 'bg-slate-600',
		car: 'bg-runway',
		transport: 'bg-teal-500',
		restaurant: 'bg-rose-500',
		other: 'bg-emerald-600'
	};
	const icon = (c: JourneyCard) => (c.type === 'flight' ? '✈️' : itemIcon(c.item!));
	const title = (c: JourneyCard) =>
		c.type === 'flight' ? `${c.flight!.origin} → ${c.flight!.destination}` : c.item!.title;
	const kind = (c: JourneyCard) => (c.type === 'flight' ? 'flight' : c.item!.kind);
</script>

<div
	bind:this={body}
	data-body
	data-start={range.start}
	data-end={range.end}
	class={['sky relative rounded-2xl', zoomed ? 'ml-12' : '']}
	style="height: {height}px"
>
	<!-- Hour lines -->
	{#each hours as m (m)}
		<div
			class="pointer-events-none absolute inset-x-0 border-t border-slate-900/10 dark:border-white/10"
			style="top: {y(m)}px"
		>
			<span
				class={[
					'absolute font-mono text-slate-500 dark:text-white/50',
					zoomed ? '-top-2 -left-11 text-[11px]' : 'top-0.5 left-1.5 text-[9px] opacity-80'
				]}>{clockOf(m)}</span
			>
		</div>
	{/each}
	{#each quarters as m (m)}
		<div
			class="pointer-events-none absolute inset-x-0 border-t border-dotted border-slate-900/5 dark:border-white/5"
			style="top: {y(m)}px"
		></div>
	{/each}

	{#if stay}
		<div
			class="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1.5 truncate rounded-lg bg-white/10 px-2 py-1 text-xs text-white/90"
		>
			<span aria-hidden="true">🌙</span>
			<span class="truncate">{stay.title}</span>
		</div>
	{/if}

	<!-- Free time between things -->
	{#each layout.gaps as g (g.from)}
		{@const h = y(g.to) - y(g.from)}
		{#if h >= (zoomed ? 20 : 16)}
			<div
				class="pointer-events-none absolute right-2 flex items-center justify-end"
				style="top: {y(g.from)}px; height: {h}px"
			>
				<span
					class="rounded-full border border-dashed border-emerald-500/60 bg-emerald-50/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
					>{formatDuration(g.minutes)} free</span
				>
			</div>
		{/if}
	{/each}

	{#each layout.placed as p, j (p.card.key)}
		{@const c = p.card}
		{@const top = y(p.start)}
		{@const h = Math.max(MIN_H, y(p.end) - top - 2)}
		{@const roomy = h >= (zoomed ? 46 : 50)}
		{@const idea = c.item?.status === 'idea'}
		<div
			class={[
				'group absolute animate-rise',
				draggingId && draggingId === c.item?.id && 'opacity-30'
			]}
			style="top: {top}px; height: {h}px; left: calc({(p.lane / p.lanes) *
				100}% + 6px); width: calc({100 / p.lanes}% - 12px); animation-delay: {j * 40}ms"
		>
			<button
				type="button"
				onpointerdown={(e) => onpress(e, c)}
				oncontextmenu={(e) => e.preventDefault()}
				onclick={() => onselect(c)}
				class={[
					'flex size-full items-stretch gap-2 overflow-hidden rounded-xl bg-white/95 pr-2 text-left shadow-md transition select-none [-webkit-touch-callout:none] hover:shadow-lg dark:bg-ink-800/95',
					idea && 'outline-2 -outline-offset-2 outline-violet-400/60 outline-dashed',
					p.overlaps && 'ring-2 ring-rose-500',
					c.movable ? 'cursor-grab' : 'cursor-default'
				]}
			>
				<span class={['w-1.5 shrink-0', STRIPE[kind(c)]]}></span>
				<span
					class={['shrink-0', roomy ? 'pt-1.5 text-lg' : 'self-center text-sm']}
					aria-hidden="true">{icon(c)}</span
				>
				<span
					class={['min-w-0 flex-1 leading-tight', roomy ? 'pt-1.5' : 'flex items-center gap-1.5']}
				>
					<span class="block shrink-0 font-mono text-[10px] text-slate-500 dark:text-slate-400">
						{clockOf(p.start)}{zoomed || roomy ? `–${clockOf(p.end)}` : ''}
						{#if roomy}
							· {c.estimated ? '~' : ''}{formatDuration(p.end - p.start)}{c.phase
								? ` · ${c.phase}`
								: ''}{p.overlaps ? ' · clashes' : ''}
						{/if}
					</span>
					<span class="block truncate text-sm font-semibold">{title(c)}</span>
					{#if roomy && c.item?.location && h >= 64}
						<span class="block truncate text-[11px] text-slate-500 dark:text-slate-400"
							>{c.item.location}</span
						>
					{/if}
				</span>
			</button>
			{#if zoomed && c.movable && onresize}
				<!-- Pull to change how long it takes -->
				<span
					role="presentation"
					onpointerdown={(e) => {
						e.stopPropagation();
						onresize(e, p, body!);
					}}
					class="absolute inset-x-6 -bottom-1.5 flex h-4 cursor-ns-resize touch-none items-center justify-center"
				>
					<span
						class="h-1.5 w-10 rounded-full bg-slate-400/80 opacity-60 transition group-hover:opacity-100 dark:bg-white/50"
					></span>
				</span>
			{/if}
		</div>
	{/each}

	{#if target && target.time}
		<div
			class="pointer-events-none absolute inset-x-1 z-10 rounded-xl border-2 border-dashed border-runway bg-runway/15"
			style="top: {target.y}px; height: {Math.max(target.h, 6)}px"
		>
			<span
				class="absolute -top-3 right-2 rounded-full bg-runway px-2 py-0.5 font-mono text-[11px] font-bold text-ink-950"
				>{target.time}</span
			>
		</div>
	{/if}
</div>

<style>
	/* Dawn, a bright day, sunset, then night: the column reads like the sky. */
	.sky {
		background: linear-gradient(
			to bottom,
			#fde9cf 0%,
			#e3f1fb 14%,
			#e3f1fb 55%,
			#fde0c2 70%,
			#d9c8f5 78%,
			#3a3a8c 88%,
			#141c46 100%
		);
	}
	@media (prefers-color-scheme: dark) {
		.sky {
			background: linear-gradient(
				to bottom,
				#2c2433 0%,
				#10284a 14%,
				#10284a 55%,
				#3b2440 70%,
				#271f52 78%,
				#121a3f 88%,
				#070b1f 100%
			);
		}
	}
</style>
