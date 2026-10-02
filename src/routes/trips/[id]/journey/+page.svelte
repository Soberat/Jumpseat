<script lang="ts">
	import { onMount } from 'svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { TimelineItem } from '#lib/server/db/schema.ts';
	import type { Sight } from '#lib/sights.ts';
	import { itemIcon } from '#lib/timeline.ts';
	import {
		cardsByDay,
		fractionOf,
		journeyDays,
		stackCards,
		stayFor,
		timeAt,
		trayItems,
		type JourneyCard,
		type JourneyDay
	} from '#lib/journey.ts';
	import Plane from '#lib/components/Plane.svelte';

	let { data } = $props();

	// ---- Optimistic placements, shown until the server confirms -------------
	type Placement = { day: JourneyDay; time: string | null } | 'tray';
	let pending = $state<Record<string, Placement>>({});

	const items = $derived(
		data.items.map((i): TimelineItem => {
			const p = pending[i.id];
			if (!p) return i;
			if (p === 'tray') return { ...i, startDate: null, day: null, startTime: null };
			return data.numbered
				? { ...i, startDate: null, day: p.day.day, startTime: p.time }
				: { ...i, startDate: p.day.date, startTime: p.time };
		})
	);
	const days = $derived(
		journeyDays(data.start, data.numbered, data.trip.endDate, data.flights, items)
	);
	const byDay = $derived(cardsByDay(data.flights, items, data.numbered));
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
	type Payload = { type: 'item'; item: TimelineItem } | { type: 'sight'; sight: Sight };
	let drag = $state<{ payload: Payload; label: string; icon: string; x: number; y: number } | null>(
		null
	);
	let over = $state<{ key: string; time: string | null; y: number } | 'tray' | null>(null);
	let justDragged = false;
	let message = $state<string | null>(null);

	function locate(x: number, y: number) {
		const el = document.elementFromPoint(x, y);
		const col = el?.closest<HTMLElement>('[data-day]');
		if (col) {
			const body = col.querySelector<HTMLElement>('[data-body]')!.getBoundingClientRect();
			over =
				y >= body.top
					? {
							key: col.dataset.day!,
							time: timeAt((y - body.top) / body.height),
							y: Math.min(y - body.top, body.height)
						}
					: { key: col.dataset.day!, time: null, y: 0 };
		} else if (el?.closest('[data-tray]')) over = 'tray';
		else over = null;
	}

	function press(e: PointerEvent, payload: Payload, label: string, icon: string) {
		if (e.button !== 0) return;
		const touch = e.pointerType !== 'mouse';
		const x0 = e.clientX;
		const y0 = e.clientY;
		let started = false;
		let raf = 0;
		let last = { x: x0, y: y0 };

		const autoscroll = () => {
			if (!drag || !scroller) return;
			const edge = 48;
			if (last.x > viewW - edge) scroller.scrollTop += 14;
			else if (last.x < edge) scroller.scrollTop -= 14;
			locate(last.x, last.y);
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
			locate(ev.clientX, ev.clientY);
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

	async function post(action: 'place' | 'addIdea', fields: Record<string, string>) {
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

	async function drop() {
		const target = over;
		const payload = drag?.payload;
		if (!target || !payload) return;
		if (target === 'tray') {
			if (payload.type !== 'item') return;
			pending[payload.item.id] = 'tray';
			await post('place', { itemId: payload.item.id });
		} else {
			const day = days.find((d) => d.key === target.key);
			if (!day) return;
			if (payload.type === 'item') {
				pending[payload.item.id] = { day, time: target.time };
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
		pending[card.item.id] = 'tray';
		await post('place', { itemId: card.item.id });
		await invalidateAll();
		pending = {};
	}

	// ---- Presentation helpers -----------------------------------------------
	const CARD_H = 58;
	const STRIPE: Record<string, string> = {
		flight: 'bg-sky-500',
		stay: 'bg-indigo-500',
		car: 'bg-runway',
		transport: 'bg-teal-500',
		restaurant: 'bg-rose-500',
		other: 'bg-violet-500'
	};
	const HOURS = [6, 9, 12, 15, 18, 21];
	const weekday = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
	const dateLabel = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
	const cardTitle = (c: JourneyCard) =>
		c.type === 'flight' ? `${c.flight!.origin} → ${c.flight!.destination}` : c.item!.title;
	const cardIcon = (c: JourneyCard) => (c.type === 'flight' ? '✈️' : itemIcon(c.item!));
	const kindOf = (c: JourneyCard) => (c.type === 'flight' ? 'flight' : c.item!.kind);
</script>

<svelte:head><title>{data.trip.title} · Journey</title></svelte:head>

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
				<a
					href="/trips/{data.trip.id}"
					class="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20">← Trip</a
				>
				<div class="min-w-0 flex-1">
					<div class="truncate font-display text-sm font-bold sm:text-base">{data.trip.title}</div>
					<div class="font-mono text-[10px] tracking-wider text-white/60 uppercase">
						Scroll to travel · hold and drag to plan
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
						{@const cards = byDay.get(d.key) ?? []}
						{@const timed = cards.filter((c) => c.time)}
						{@const untimed = cards.filter((c) => !c.time)}
						{@const tops = stackCards(
							timed.map((c) => fractionOf(c.time!)),
							bodyH,
							CARD_H
						)}
						{@const stay = stayFor(d.date, items)}
						{@const target = over && over !== 'tray' && over.key === d.key ? over : null}
						<section
							data-day={d.key}
							class={[
								'relative flex h-full w-[calc(100vw-40px)] shrink-0 flex-col border-r border-slate-300/50 sm:w-[340px] dark:border-white/10',
								target && 'bg-runway/10'
							]}
						>
							<!-- Day header -->
							<div class="relative px-4 pt-11 pb-2">
								<span
									class="pointer-events-none absolute top-1 right-3 font-display text-7xl leading-none font-bold text-slate-900/5 dark:text-white/5"
									aria-hidden="true">{d.day}</span
								>
								<div class="flex items-center gap-2">
									<span
										class={[
											'flex size-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ring-4 ring-paper dark:ring-ink-950',
											i === current ? 'bg-runway text-ink-950' : 'bg-slate-300 dark:bg-ink-700'
										]}>{d.day}</span
									>
									<div class="leading-tight">
										<div class="font-semibold">{d.date ? weekday(d.date) : `Day ${d.day}`}</div>
										<div class="text-xs text-slate-500 dark:text-slate-400">
											{d.date ? dateLabel(d.date) : 'Dates not set yet'}
										</div>
									</div>
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
											onpointerdown={(e) =>
												c.movable &&
												c.item &&
												press(e, { type: 'item', item: c.item }, c.item.title, cardIcon(c))}
											oncontextmenu={(e) => e.preventDefault()}
											onclick={() => !justDragged && (selected = c)}
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

							<!-- The day itself, dawn at the top and night at the bottom -->
							<div
								data-body
								class="sky relative mx-2 mb-2 flex-1 rounded-2xl"
								bind:clientHeight={bodyH}
							>
								{#each HOURS as h (h)}
									<div
										class="pointer-events-none absolute inset-x-0 border-t border-slate-900/5 dark:border-white/5"
										style="top: {((h - 6) / 18) * 100}%"
									>
										<span
											class="absolute top-0.5 left-1.5 font-mono text-[9px] text-slate-500/80 dark:text-white/40"
											>{String(h).padStart(2, '0')}</span
										>
									</div>
								{/each}

								{#if stay}
									<div
										class="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1.5 truncate rounded-lg bg-white/10 px-2 py-1 text-xs text-white/90"
									>
										<span aria-hidden="true">🌙</span>
										<span class="truncate">{stay.title}</span>
									</div>
								{/if}

								{#each timed as c, j (c.key)}
									{@const idea = c.item?.status === 'idea'}
									<button
										type="button"
										onpointerdown={(e) =>
											c.movable &&
											c.item &&
											press(e, { type: 'item', item: c.item }, c.item.title, cardIcon(c))}
										oncontextmenu={(e) => e.preventDefault()}
										onclick={() => !justDragged && (selected = c)}
										class={[
											'absolute inset-x-2 flex animate-rise items-center gap-2 overflow-hidden rounded-xl bg-white/95 pr-2 text-left shadow-md transition select-none [-webkit-touch-callout:none] hover:shadow-lg dark:bg-ink-800/95',
											idea && 'outline-2 -outline-offset-2 outline-violet-400/60 outline-dashed',
											c.movable ? 'cursor-grab' : 'cursor-default',
											drag?.payload.type === 'item' &&
												drag.payload.item.id === c.item?.id &&
												'opacity-30'
										]}
										style="top: {tops[j]}px; height: {CARD_H - 6}px; animation-delay: {j * 50}ms"
									>
										<span class={['h-full w-1.5 shrink-0', STRIPE[kindOf(c)]]}></span>
										<span class="text-lg" aria-hidden="true">{cardIcon(c)}</span>
										<span class="min-w-0 flex-1 leading-tight">
											<span class="block font-mono text-[10px] text-slate-500 dark:text-slate-400">
												{c.time}{c.phase ? ` · ${c.phase}` : ''}{c.flight
													? ` · ${c.flight.flightNumber}`
													: ''}{idea ? ' · idea' : ''}
											</span>
											<span class="block truncate text-sm font-semibold">{cardTitle(c)}</span>
											{#if c.item?.location}
												<span class="block truncate text-[11px] text-slate-500 dark:text-slate-400"
													>{c.item.location}</span
												>
											{/if}
										</span>
									</button>
								{/each}

								{#if target && target.time}
									<div
										class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-runway"
										style="top: {target.y}px"
									>
										<span
											class="absolute -top-3 right-2 rounded-full bg-runway px-2 py-0.5 font-mono text-[11px] font-bold text-ink-950"
											>{target.time}</span
										>
									</div>
								{/if}
							</div>
						</section>
					{/each}
				</div>
			</div>

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
								onpointerdown={(e) => press(e, { type: 'item', item }, item.title, itemIcon(item))}
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
									onpointerdown={(e) => press(e, { type: 'sight', sight: s }, s.title, '📍')}
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
		<button type="button" class="float-right font-bold" onclick={() => (message = null)}>✕</button>
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
						{[c.phase, c.time ?? 'Any time', c.item?.status === 'idea' ? 'idea' : null]
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
				{#if c.movable && c.item}
					<button
						type="button"
						onclick={() => unplace(c)}
						class="rounded-full border border-slate-300 px-3 py-1.5 text-sm dark:border-white/20"
						>Back to ideas</button
					>
				{/if}
				<a
					href="/trips/{data.trip.id}#entry-{c.key}"
					class="rounded-full bg-ink-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-ink-950"
					>{c.flight ? 'Standby loads' : 'Edit on trip page'}</a
				>
			</div>
		</div>
	</div>
{/if}

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
