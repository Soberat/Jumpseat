<script lang="ts">
	import { LOCALE } from '#lib/format.ts';
	import { onMount } from 'svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
	import type { Sight } from '#lib/sights.ts';
	import { isWet, weatherByDate, type DayWeather, type TripWeather } from '#lib/climate.ts';
	import { itemIcon } from '#lib/timeline.ts';
	import {
		cardsByDay,
		dayRange,
		journeyDays,
		layoutDay,
		stayFor,
		timeAt,
		trayItems,
		type JourneyCard,
		type JourneyDay,
		type PlacedCard
	} from '#lib/journey.ts';
	import {
		clockOf,
		formatDuration,
		itemMinutes,
		minutesOf,
		parseDuration as parseLength
	} from '#lib/duration.ts';
	import Plane from '#lib/components/Plane.svelte';
	import DayBody from '#lib/components/DayBody.svelte';

	type Data = {
		trip: { id: string; title: string; endDate: string | null };
		flights: Flight[];
		items: TimelineItem[];
		start: string | null;
		numbered: boolean;
		sights: Promise<Sight[]>;
		weather?: Promise<TripWeather | null>;
	};
	let {
		data,
		editable = true,
		backHref,
		guest = false
	}: {
		data: Data;
		/** Can drag, resize and add ideas (an owner, or an editable share link). */
		editable?: boolean;
		backHref: string;
		/** Opened from a share link: no links into the private trip page. */
		guest?: boolean;
	} = $props();

	// ---- Optimistic changes, shown until the server confirms ---------------
	let pending = $state<Record<string, Partial<TimelineItem>>>({});
	/** Live length while a card is being pulled longer or shorter. */
	let stretching = $state<{ id: string; minutes: number } | null>(null);

	const items = $derived(
		data.items.map((i): TimelineItem => {
			const p = pending[i.id];
			const next = p ? { ...i, ...p } : i;
			return stretching?.id === i.id ? { ...next, durationMinutes: stretching.minutes } : next;
		})
	);
	const days = $derived(
		journeyDays(data.start, data.numbered, data.trip.endDate, data.flights, items)
	);
	const byDay = $derived(cardsByDay(data.flights, items, data.numbered));
	const range = $derived(dayRange(byDay));
	const layouts = $derived(
		new Map([...byDay].map(([key, cards]) => [key, layoutDay(cards)] as const))
	);
	const EMPTY = { placed: [], gaps: [] };
	const tray = $derived(trayItems(items, data.numbered));
	const plannedTitles = $derived(new Set(data.items.map((i) => i.title.toLowerCase())));

	// ---- Scrolling down moves the journey sideways --------------------------
	let scroller = $state<HTMLDivElement>();
	let track = $state<HTMLDivElement>();
	let viewW = $state(0);
	let viewH = $state(0);
	let trackW = $state(0);
	let scrollY = $state(0);
	let bodyH = $state(400);
	/** The day open in the by-the-minute view, if any. */
	let zoom = $state<string | null>(null);
	let zoomScroller = $state<HTMLDivElement>();
	/** Pixels per minute when zoomed: an hour is 120px. */
	const ZOOM_SCALE = 2;
	const zoomDay = $derived(days.find((d) => d.key === zoom) ?? null);

	function openZoom(key: string) {
		zoom = key;
		// Start at the first thing planned that day.
		requestAnimationFrame(() => {
			const first = layouts.get(key)?.placed[0];
			if (zoomScroller && first) {
				zoomScroller.scrollTop = Math.max(0, (first.start - range.start) * ZOOM_SCALE - 60);
			}
		});
	}
	const travel = $derived(Math.max(0, trackW - viewW));
	const progress = $derived(travel ? Math.min(1, scrollY / travel) : 0);
	const colW = $derived(days.length ? trackW / days.length : 1);
	const current = $derived(Math.min(days.length - 1, Math.round(scrollY / colW)));

	function jumpTo(i: number) {
		scroller?.scrollTo({ top: Math.min(travel, i * colW), behavior: 'smooth' });
	}

	onMount(() => {
		document.documentElement.style.overflow = 'hidden';
		const measure = () => {
			if (track) trackW = track.scrollWidth;
		};
		const ro = new ResizeObserver(measure);
		if (track) ro.observe(track);
		measure();
		// A sideways swipe on a trackpad should move the journey too.
		const wheel = (e: WheelEvent) => {
			if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && scroller) {
				e.preventDefault();
				scroller.scrollTop += e.deltaX;
			}
		};
		scroller?.addEventListener('wheel', wheel, { passive: false });
		// While dragging on a phone, the finger moves the card, not the page.
		const touchmove = (e: TouchEvent) => {
			if (drag) e.preventDefault();
		};
		document.addEventListener('touchmove', touchmove, { passive: false });
		// Open on today when the trip is under way.
		const today = new Date().toLocaleDateString('sv');
		const at = days.findIndex((d) => d.date === today);
		if (at > 0) requestAnimationFrame(() => jumpTo(at));
		return () => {
			document.documentElement.style.overflow = '';
			ro.disconnect();
			scroller?.removeEventListener('wheel', wheel);
			document.removeEventListener('touchmove', touchmove);
		};
	});

	// ---- Drag and drop (pointer events, so it works with touch too) ---------
	type Payload =
		| { type: 'item'; item: TimelineItem; minutes: number }
		| { type: 'sight'; sight: Sight; minutes: number };
	type Over = { key: string; time: string | null; y: number; h: number } | 'tray' | null;
	let drag = $state<{ payload: Payload; label: string; icon: string; x: number; y: number } | null>(
		null
	);
	let over = $state<Over>(null);
	let justDragged = false;
	let message = $state<string | null>(null);

	/** What's under the pointer. `grab` is how far below the card's top it was picked up. */
	function locate(x: number, y: number, grab: number, minutes: number) {
		const el = document.elementFromPoint(x, y);
		const col = el?.closest<HTMLElement>('[data-day]');
		const bodyEl = col?.querySelector<HTMLElement>('[data-body]');
		if (col && bodyEl) {
			const box = bodyEl.getBoundingClientRect();
			const start = Number(bodyEl.dataset.start);
			const end = Number(bodyEl.dataset.end);
			const perMinute = box.height / (end - start);
			if (y < box.top) {
				over = { key: col.dataset.day!, time: null, y: 0, h: 0 };
				return;
			}
			const time = timeAt((y - grab - box.top) / box.height, { start, end });
			over = {
				key: col.dataset.day!,
				time,
				y: (minutesOf(time) - start) * perMinute,
				h: minutes * perMinute
			};
		} else if (el?.closest('[data-tray]')) over = 'tray';
		else over = null;
	}

	function press(e: PointerEvent, payload: Payload, label: string, icon: string) {
		if (e.button !== 0 || !editable) return;
		const touch = e.pointerType !== 'mouse';
		const x0 = e.clientX;
		const y0 = e.clientY;
		// Keep the card's top under the same spot it was grabbed, so drops land where they look.
		const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const grab = (e.currentTarget as HTMLElement).closest('[data-body]') ? y0 - card.top : 0;
		let started = false;
		let raf = 0;
		let last = { x: x0, y: y0 };

		const autoscroll = () => {
			if (!drag) return;
			const edge = 48;
			if (zoom && zoomScroller) {
				const box = zoomScroller.getBoundingClientRect();
				if (last.y > box.bottom - edge) zoomScroller.scrollTop += 10;
				else if (last.y < box.top + edge) zoomScroller.scrollTop -= 10;
			} else if (scroller) {
				if (last.x > viewW - edge) scroller.scrollTop += 14;
				else if (last.x < edge) scroller.scrollTop -= 14;
			}
			locate(last.x, last.y, grab, payload.minutes);
			raf = requestAnimationFrame(autoscroll);
		};
		const begin = () => {
			started = true;
			drag = { payload, label, icon, x: last.x, y: last.y };
			navigator.vibrate?.(12);
			raf = requestAnimationFrame(autoscroll);
		};
		// On touch, hold briefly to pick up; moving straight away scrolls instead.
		const timer = touch ? setTimeout(begin, 260) : 0;

		const move = (ev: PointerEvent) => {
			last = { x: ev.clientX, y: ev.clientY };
			if (!started) {
				const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
				if (touch) {
					if (d > 10) stop();
					return;
				}
				if (d < 5) return;
				begin();
			}
			drag!.x = ev.clientX;
			drag!.y = ev.clientY;
			locate(ev.clientX, ev.clientY, grab, payload.minutes);
		};
		const up = () => {
			if (started) {
				justDragged = true;
				setTimeout(() => (justDragged = false), 0);
				drop();
			}
			stop();
		};
		const stop = () => {
			clearTimeout(timer);
			cancelAnimationFrame(raf);
			drag = null;
			over = null;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', stop);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', stop);
	}

	function pressCard(e: PointerEvent, c: JourneyCard) {
		if (!c.movable || !c.item) return;
		press(e, { type: 'item', item: c.item, minutes: c.minutes }, c.item.title, cardIcon(c));
	}

	/** Pull a card's bottom edge to change how long it takes (five-minute steps). */
	function pressResize(e: PointerEvent, p: PlacedCard, bodyEl: HTMLElement) {
		if (e.button !== 0 || !p.card.item || !editable) return;
		const id = p.card.item.id;
		const move = (ev: PointerEvent) => {
			const box = bodyEl.getBoundingClientRect();
			const start = Number(bodyEl.dataset.start);
			const end = Number(bodyEl.dataset.end);
			const at = start + ((ev.clientY - box.top) / box.height) * (end - start);
			const minutes = Math.max(5, Math.round((at - p.start) / 5) * 5);
			stretching = { id, minutes: Math.min(minutes, 24 * 60 - p.start) };
		};
		const up = async () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', up);
			justDragged = true;
			setTimeout(() => (justDragged = false), 0);
			if (!stretching) return;
			const minutes = stretching.minutes;
			pending[id] = { ...pending[id], durationMinutes: minutes };
			stretching = null;
			await post('edit', { itemId: id, duration: String(minutes) });
			await invalidateAll();
			pending = {};
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
	}

	async function post(action: 'place' | 'addIdea' | 'edit', fields: Record<string, string>) {
		const body = new FormData();
		for (const [k, v] of Object.entries(fields)) body.set(k, v);
		const res = await fetch(`?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await res.text());
		if (result.type === 'failure') message = String(result.data?.error ?? 'That didn’t work.');
		else if (result.type === 'error') message = 'Couldn’t save that. Are you online?';
	}

	function slotFields(day: JourneyDay, time: string | null): Record<string, string> {
		return data.numbered
			? { day: String(day.day), time: time ?? '' }
			: { date: day.date ?? '', time: time ?? '' };
	}

	function slotChanges(day: JourneyDay, time: string | null): Partial<TimelineItem> {
		return data.numbered
			? { startDate: null, day: day.day, startTime: time }
			: { startDate: day.date, startTime: time };
	}

	async function drop() {
		const target = over;
		const payload = drag?.payload;
		if (!target || !payload) return;
		if (target === 'tray') {
			if (payload.type !== 'item') return;
			pending[payload.item.id] = { startDate: null, day: null, startTime: null };
			await post('place', { itemId: payload.item.id });
		} else {
			const day = days.find((d) => d.key === target.key);
			if (!day) return;
			if (payload.type === 'item') {
				pending[payload.item.id] = slotChanges(day, target.time);
				await post('place', { itemId: payload.item.id, ...slotFields(day, target.time) });
			} else {
				const s = payload.sight;
				await post('addIdea', {
					title: s.title,
					url: s.url,
					notes: s.description ?? '',
					...slotFields(day, target.time)
				});
			}
		}
		await invalidateAll();
		pending = {};
	}

	// ---- Details sheet and the tray ------------------------------------------
	let selected = $state<JourneyCard | null>(null);
	let tab = $state<'ideas' | 'sights'>('ideas');
	let weather = $state(new Map<string, DayWeather>());
	$effect(() => {
		data.weather?.then((w) => (weather = weatherByDate(w)));
	});
	let newIdea = $state('');

	async function addIdea(e: SubmitEvent) {
		e.preventDefault();
		const title = newIdea.trim();
		if (!title) return;
		newIdea = '';
		await post('addIdea', { title });
		await invalidateAll();
	}

	async function unplace(card: JourneyCard) {
		selected = null;
		if (!card.item) return;
		pending[card.item.id] = { startDate: null, day: null, startTime: null };
		await post('place', { itemId: card.item.id });
		await invalidateAll();
		pending = {};
	}

	// Time and length, edited exactly in the details sheet.
	let editTime = $state('');
	let editDuration = $state('');
	function select(c: JourneyCard) {
		if (justDragged) return;
		selected = c;
		editTime = c.time ?? '';
		editDuration = c.item?.durationMinutes
			? formatDuration(c.item.durationMinutes).replace(' ', '')
			: '';
	}
	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		const c = selected;
		if (!c?.item) return;
		selected = null;
		await post('edit', { itemId: c.item.id, time: editTime, duration: editDuration });
		await invalidateAll();
	}
	const QUICK = [15, 30, 45, 60, 90, 120, 180];

	/** Planned and free time between the first and last thing on a day. */
	function dayStats(key: string) {
		const l = layouts.get(key);
		if (!l || l.placed.length === 0) return null;
		const free = l.gaps.reduce((a, g) => a + g.minutes, 0);
		const first = Math.min(...l.placed.map((p) => p.start));
		const last = Math.max(...l.placed.map((p) => p.end));
		return { busy: last - first - free, free, first, last };
	}

	// ---- Presentation helpers -----------------------------------------------
	const weekday = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'long' });
	const dateLabel = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
	const cardTitle = (c: JourneyCard) =>
		c.type === 'flight' ? `${c.flight!.origin} → ${c.flight!.destination}` : c.item!.title;
	const cardIcon = (c: JourneyCard) => (c.type === 'flight' ? '✈️' : itemIcon(c.item!));
</script>

{#snippet dayHeader(
	d: JourneyDay,
	i: number,
	untimed: JourneyCard[],
	target: { time: string | null } | null,
	stats: ReturnType<typeof dayStats>
)}
	<div class={['relative px-4 pb-2', zoom === d.key ? 'pt-3' : 'pt-11']}>
		<span
			class="pointer-events-none absolute top-1 right-3 font-display text-7xl leading-none font-bold text-slate-900/5 dark:text-white/5"
			aria-hidden="true">{d.day}</span
		>
		<div class="flex items-center gap-2">
			<span
				class={[
					'flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ring-4 ring-paper dark:ring-ink-950',
					i === current || zoom === d.key
						? 'bg-runway text-ink-950'
						: 'bg-slate-300 dark:bg-ink-700'
				]}>{d.day}</span
			>
			<div class="min-w-0 flex-1 leading-tight">
				<div class="flex items-center gap-2 font-semibold">
					{d.date ? weekday(d.date) : `Day ${d.day}`}
					{#if d.date && weather.get(d.date)}
						{@const w = weather.get(d.date)!}
						<span
							class={[
								'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
								isWet(w)
									? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
									: 'bg-amber-100/80 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200'
							]}
							title="{w.summary}{w.rainChance !== null
								? `, ${w.rainChance}% chance of rain`
								: ''}{w.typical ? ' (typical for this date)' : ''}">{w.icon} {w.maxC}°</span
						>
					{/if}
				</div>
				<div class="truncate text-xs text-slate-500 dark:text-slate-400">
					{d.date ? dateLabel(d.date) : 'Dates not set yet'}{stats
						? ` · ${clockOf(stats.first)}–${clockOf(stats.last)}, ${formatDuration(stats.free)} free`
						: ''}
				</div>
			</div>
			{#if zoom !== d.key}
				<button
					type="button"
					onclick={() => openZoom(d.key)}
					class="relative shrink-0 rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-ink-700 dark:bg-white dark:text-ink-950"
					>⏱ By the minute</button
				>
			{/if}
		</div>
		<!-- Things with a day but no time -->
		<div
			class={[
				'mt-2 flex min-h-8 flex-wrap gap-1.5 rounded-lg',
				target && target.time === null && 'ring-2 ring-runway'
			]}
		>
			{#each untimed as c (c.key)}
				<button
					type="button"
					onpointerdown={(e) => pressCard(e, c)}
					oncontextmenu={(e) => e.preventDefault()}
					onclick={() => select(c)}
					class="flex max-w-full items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium shadow-sm select-none [-webkit-touch-callout:none] dark:bg-ink-800"
				>
					<span aria-hidden="true">{cardIcon(c)}</span>
					<span class="truncate">{cardTitle(c)}</span>
				</button>
			{:else}
				<span class="py-1 text-xs text-slate-400 dark:text-slate-500"
					>{target && target.time === null ? 'Drop for any time' : ''}</span
				>
			{/each}
		</div>
	</div>
{/snippet}

<svelte:head><title>{data.trip.title} · Journey</title></svelte:head>

<!-- One root element: the layout spaces its children apart, and a drag ghost or
	dialog appearing would otherwise give the full-screen view a margin. -->
<div class="contents">
	<div
		bind:this={scroller}
		bind:clientWidth={viewW}
		bind:clientHeight={viewH}
		onscroll={() => (scrollY = scroller!.scrollTop)}
		class={[
			'fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-paper text-slate-900 dark:bg-ink-950 dark:text-slate-100',
			!drag && 'max-sm:snap-y max-sm:snap-mandatory'
		]}
	>
		<div class="relative" style="height: {viewH + travel}px">
			<!-- Snap points, one per day, so a phone swipe settles on a whole day. -->
			{#each days as d, i (d.key)}
				<span
					class="pointer-events-none absolute inset-x-0 h-px snap-start"
					style="top: {Math.min(travel, i * colW)}px"
					aria-hidden="true"
				></span>
			{/each}
			<div class="sticky top-0 flex flex-col overflow-hidden" style="height: {viewH}px">
				<!-- Top bar: back, title, and a day scrubber -->
				<header
					class="relative z-20 flex items-center gap-3 bg-ink-900 px-4 py-2.5 text-white shadow-lg"
				>
					<a href={backHref} class="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
						>← Trip</a
					>
					<div class="min-w-0 flex-1">
						<div class="truncate font-display text-sm font-bold sm:text-base">
							{data.trip.title}
						</div>
						<div class="font-mono text-[10px] tracking-wider text-white/60 uppercase">
							{editable ? 'Scroll to travel · hold and drag to plan' : 'Scroll to travel'}
						</div>
					</div>
					<nav class="hidden items-center gap-1 sm:flex" aria-label="Days">
						{#each days as d, i (d.key)}
							<button
								type="button"
								onclick={() => jumpTo(i)}
								class={[
									'size-7 rounded-full font-mono text-[11px] font-bold transition',
									i === current
										? 'bg-runway text-ink-950'
										: 'bg-white/10 text-white/70 hover:bg-white/20'
								]}
								aria-label="Day {d.day}"
								aria-current={i === current}>{d.day}</button
							>
						{/each}
					</nav>
				</header>

				<!-- The journey -->
				<div class="relative flex-1 overflow-hidden">
					{#if zoomDay}
						{@const d = zoomDay}
						{@const target = over && over !== 'tray' && over.key === d.key ? over : null}
						<!-- One day, by the minute -->
						<div
							data-day={d.key}
							class="absolute inset-0 z-30 flex animate-rise flex-col bg-paper dark:bg-ink-950"
						>
							<div
								class="flex items-center gap-2 border-b border-slate-200 pr-2 dark:border-white/10"
							>
								<button
									type="button"
									onclick={() => (zoom = null)}
									class="ml-3 shrink-0 rounded-full bg-slate-200 px-3 py-1 text-sm font-medium dark:bg-ink-800"
									>← All days</button
								>
								<div class="min-w-0 flex-1">
									{@render dayHeader(
										d,
										days.indexOf(d),
										(byDay.get(d.key) ?? []).filter((c) => !c.time),
										target,
										dayStats(d.key)
									)}
								</div>
							</div>
							<div
								bind:this={zoomScroller}
								class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4"
							>
								<div class="mx-auto max-w-2xl">
									<DayBody
										zoomed
										layout={layouts.get(d.key) ?? EMPTY}
										{range}
										height={(range.end - range.start) * ZOOM_SCALE}
										stay={stayFor(d.date, items)}
										target={target && target.time ? target : null}
										draggingId={drag?.payload.type === 'item' ? drag.payload.item.id : null}
										onpress={pressCard}
										onresize={editable ? pressResize : undefined}
										onselect={select}
									/>
								</div>
							</div>
						</div>
					{/if}

					<div
						bind:this={track}
						class="absolute inset-y-0 left-0 flex will-change-transform"
						style="transform: translateX({-Math.min(scrollY, travel)}px)"
					>
						<!-- Contrail across the whole trip, with a plane that flies as you scroll. -->
						<div class="pointer-events-none absolute inset-x-6 top-[30px] z-10" aria-hidden="true">
							<div class="border-t-2 border-dashed border-runway/50"></div>
							<span
								class="absolute -top-[11px] text-runway drop-shadow"
								style="left: calc({progress * 100}% - 10px)"><Plane /></span
							>
						</div>

						{#each days as d, i (d.key)}
							{@const untimed = (byDay.get(d.key) ?? []).filter((c) => !c.time)}
							{@const stay = stayFor(d.date, items)}
							{@const stats = dayStats(d.key)}
							{@const target = !zoom && over && over !== 'tray' && over.key === d.key ? over : null}
							<section
								data-day={zoom ? undefined : d.key}
								class={[
									'relative flex h-full w-[calc(100vw-40px)] shrink-0 flex-col border-r border-slate-300/50 sm:w-[340px] dark:border-white/10',
									target && 'bg-runway/10'
								]}
							>
								{@render dayHeader(d, i, untimed, target, stats)}
								<!-- The day itself, dawn at the top and night at the bottom -->
								<div class="mx-2 mb-2 min-h-0 flex-1" bind:clientHeight={bodyH}>
									<DayBody
										layout={layouts.get(d.key) ?? EMPTY}
										{range}
										height={bodyH}
										{stay}
										target={target && target.time ? target : null}
										draggingId={drag?.payload.type === 'item' ? drag.payload.item.id : null}
										onpress={pressCard}
										onselect={select}
									/>
								</div>
							</section>
						{/each}
					</div>
				</div>

				{#if editable}
					<!-- Ideas tray -->
					<div
						data-tray
						class={[
							'relative z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition dark:border-white/10 dark:bg-ink-900/95',
							over === 'tray' && 'bg-runway/20 dark:bg-runway/20'
						]}
					>
						<div class="flex items-center gap-1 px-3 pt-2">
							<button
								type="button"
								onclick={() => (tab = 'ideas')}
								class={[
									'rounded-full px-3 py-1 text-sm font-medium',
									tab === 'ideas'
										? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
										: 'text-slate-500'
								]}>Ideas · {tray.length}</button
							>
							<button
								type="button"
								onclick={() => (tab = 'sights')}
								class={[
									'rounded-full px-3 py-1 text-sm font-medium',
									tab === 'sights'
										? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
										: 'text-slate-500'
								]}>Nearby sights</button
							>
							<span class="ml-auto hidden text-xs text-slate-500 sm:inline dark:text-slate-400">
								{drag?.payload.type === 'item' ? 'Drop here to unplan' : 'Drag onto a day'}
							</span>
						</div>
						<div class="flex [scrollbar-width:none] gap-2 overflow-x-auto px-3 py-2.5">
							{#if tab === 'ideas'}
								<form onsubmit={addIdea} class="flex shrink-0 items-center gap-1">
									<input
										bind:value={newIdea}
										placeholder="New idea…"
										aria-label="New idea"
										class="w-36 rounded-full! py-1.5! text-sm"
									/>
									<button
										type="submit"
										class="rounded-full bg-runway px-3 py-1.5 text-sm font-semibold text-ink-950"
										aria-label="Add idea">+</button
									>
								</form>
								{#each tray as item (item.id)}
									<button
										type="button"
										onpointerdown={(e) =>
											press(
												e,
												{ type: 'item', item, minutes: itemMinutes(item).minutes },
												item.title,
												itemIcon(item)
											)}
										oncontextmenu={(e) => e.preventDefault()}
										class="flex max-w-56 shrink-0 cursor-grab items-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50 px-3 py-1.5 text-left text-sm select-none [-webkit-touch-callout:none] dark:border-violet-700 dark:bg-violet-950/40"
									>
										<span aria-hidden="true">{itemIcon(item)}</span>
										<span class="truncate font-medium">{item.title}</span>
									</button>
								{:else}
									<span class="self-center text-sm text-slate-500 dark:text-slate-400"
										>Everything is planned. Add an idea, or drag a card here to unplan it.</span
									>
								{/each}
							{:else}
								{#await data.sights}
									<span class="text-sm text-slate-500">Looking for sights nearby…</span>
								{:then sights}
									{#each sights.filter((s) => !plannedTitles.has(s.title.toLowerCase())) as s (s.title)}
										<button
											type="button"
											onpointerdown={(e) =>
												press(e, { type: 'sight', sight: s, minutes: 90 }, s.title, '📍')}
											oncontextmenu={(e) => e.preventDefault()}
											class="flex max-w-60 shrink-0 cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-3 text-left text-sm select-none [-webkit-touch-callout:none] dark:border-white/10 dark:bg-ink-800"
										>
											{#if s.thumbnail}
												<img
													src={s.thumbnail}
													alt=""
													draggable="false"
													class="size-9 shrink-0 rounded-lg object-cover"
												/>
											{:else}
												<span class="flex size-9 items-center justify-center" aria-hidden="true"
													>📍</span
												>
											{/if}
											<span class="min-w-0 leading-tight">
												<span class="block truncate font-medium">{s.title}</span>
												<span class="block truncate text-xs text-slate-500 dark:text-slate-400"
													>{s.distanceKm} km away</span
												>
											</span>
										</button>
									{:else}
										<span class="text-sm text-slate-500">No suggestions right now.</span>
									{/each}
								{/await}
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- The card being dragged -->
	{#if drag}
		<div
			class="pointer-events-none fixed z-[60] flex max-w-60 -translate-x-1/2 -translate-y-[120%] items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold shadow-2xl ring-2 ring-runway dark:bg-ink-800"
			style="left: {drag.x}px; top: {drag.y}px"
		>
			<span aria-hidden="true">{drag.icon}</span>
			<span class="truncate">{drag.label}</span>
			{#if over && over !== 'tray'}
				<span class="shrink-0 font-mono text-xs text-runway">{over.time ?? 'any time'}</span>
			{/if}
		</div>
	{/if}

	{#if message}
		<div
			role="alert"
			class="fixed inset-x-4 top-16 z-[60] mx-auto max-w-sm rounded-xl bg-rose-600 px-4 py-3 text-sm text-white shadow-xl"
		>
			{message}
			<button type="button" class="float-right font-bold" onclick={() => (message = null)}>✕</button
			>
		</div>
	{/if}

	<!-- Details for a tapped card -->
	{#if selected}
		{@const c = selected}
		<div
			class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center"
			role="presentation"
			onclick={(e) => e.target === e.currentTarget && (selected = null)}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={cardTitle(c)}
				class="w-full max-w-md animate-rise space-y-3 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl dark:bg-ink-900"
			>
				<div class="flex items-start gap-3">
					<span class="text-3xl" aria-hidden="true">{cardIcon(c)}</span>
					<div class="min-w-0 flex-1">
						<div class="font-mono text-xs text-slate-500 dark:text-slate-400">
							{[
								c.phase,
								c.time ? `${c.time}–${clockOf(minutesOf(c.time) + c.minutes)}` : 'Any time',
								`${c.estimated ? '~' : ''}${formatDuration(c.minutes)}`,
								c.item?.status === 'idea' ? 'idea' : null
							]
								.filter(Boolean)
								.join(' · ')}
						</div>
						<h2 class="text-lg font-semibold">{cardTitle(c)}</h2>
						{#if c.flight}
							<p class="text-sm text-slate-500 dark:text-slate-400">
								{c.flight.flightNumber}{c.flight.standby ? ' · standby' : ''}
							</p>
						{/if}
						{#if c.item?.location}
							<p class="text-sm text-slate-500 dark:text-slate-400">{c.item.location}</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => (selected = null)}
						class="rounded-full px-2 text-xl text-slate-400"
						aria-label="Close">✕</button
					>
				</div>
				{#if c.item && c.movable && editable}
					<form onsubmit={saveEdit} class="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-ink-800">
						<div class="flex flex-wrap items-end gap-2">
							{#if c.item.startDate || c.item.day}
								<label class="flex flex-col gap-1 text-xs font-medium text-slate-500">
									Starts
									<input type="time" bind:value={editTime} class="w-28" />
								</label>
							{/if}
							<label class="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
								Takes
								<input
									bind:value={editDuration}
									placeholder={c.estimated ? `about ${formatDuration(c.minutes)}` : 'e.g. 1h30'}
									class="min-w-24"
								/>
							</label>
							<button
								type="submit"
								class="rounded-full bg-runway px-4 py-2 text-sm font-semibold text-ink-950"
								>Save</button
							>
						</div>
						<div class="flex flex-wrap gap-1.5">
							{#each QUICK as m (m)}
								<button
									type="button"
									onclick={() => (editDuration = formatDuration(m).replace(' ', ''))}
									class="rounded-full border border-slate-300 px-2.5 py-0.5 font-mono text-xs dark:border-white/20"
									>{formatDuration(m)}</button
								>
							{/each}
						</div>
						{#if editTime && (editDuration || c.minutes)}
							{@const length = parseLength(editDuration) ?? c.minutes}
							<p class="font-mono text-xs text-slate-500 dark:text-slate-400">
								{editTime}–{clockOf(minutesOf(editTime) + length)}
							</p>
						{/if}
					</form>
				{/if}
				{#if c.item?.notes}
					<p class="text-sm whitespace-pre-line">{c.item.notes}</p>
				{/if}
				<div class="flex flex-wrap gap-2 pt-1">
					{#if c.item?.url}
						<a
							href={c.item.url}
							target="_blank"
							rel="noopener noreferrer"
							class="rounded-full border border-slate-300 px-3 py-1.5 text-sm dark:border-white/20"
							>Open link</a
						>
					{/if}
					{#if c.movable && c.item && editable}
						<button
							type="button"
							onclick={() => unplace(c)}
							class="rounded-full border border-slate-300 px-3 py-1.5 text-sm dark:border-white/20"
							>Back to ideas</button
						>
					{/if}
					{#if !guest}
						<a
							href="/trips/{data.trip.id}#entry-{c.key}"
							class="rounded-full bg-ink-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-ink-950"
							>{c.flight ? 'Standby loads' : 'Edit on trip page'}</a
						>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
