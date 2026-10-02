<script lang="ts">
	import { formatStamp } from '#lib/format.ts';
	import { onMount } from 'svelte';
	import { priceLinks } from '#lib/flight-info.ts';
	import { formatDuration } from '#lib/duration.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import AddToTimeline from '#lib/components/AddToTimeline.svelte';
	import TimelineView from '#lib/components/TimelineView.svelte';
	import type { Flight, TimelineItem } from '#lib/server/db/schema.ts';
	import CostFields from '#lib/components/CostFields.svelte';
	import Attachments from '#lib/components/Attachments.svelte';
	import { costOf, describeCost, type CostTone } from '#lib/cost.ts';
	import { page } from '$app/state';
	import { afterNavigate, goto } from '$app/navigation';
	import TripWhenFields from '#lib/components/TripWhenFields.svelte';
	import Weather from '#lib/components/Weather.svelte';
	import PackingList from '#lib/components/PackingList.svelte';
	import Expenses from '#lib/components/Expenses.svelte';
	import ThingsToDo from '#lib/components/ThingsToDo.svelte';
	import TripHero from '#lib/components/TripHero.svelte';
	import TripTimeline from '#lib/components/TripTimeline.svelte';
	import OriginField from '#lib/components/OriginField.svelte';
	import StopsField from '#lib/components/StopsField.svelte';
	import { readStops } from '#lib/trip-route.ts';
	import { bestOptions, ODDS_LABELS, oddsFor, type Odds } from '#lib/standby.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Four tabs keep the page to about a screen each. The tab is in the URL (?tab=money),
	// so reloading or going back lands on the same one.
	const TABS = [
		{ id: 'plan', label: 'Plan', icon: '🗺️' },
		{ id: 'money', label: 'Money', icon: '💳' },
		{ id: 'packing', label: 'Packing', icon: '🎒' },
		{ id: 'share', label: 'Share', icon: '🔗' }
	] as const;
	type Tab = (typeof TABS)[number]['id'];
	const isTab = (t: string | null): t is Tab => TABS.some((x) => x.id === t);
	const initial = page.url.searchParams.get('tab');
	let tab = $state<Tab>(isTab(initial) ? initial : 'plan');
	function show(t: Tab) {
		tab = t;
		syncUrl();
	}
	function syncUrl() {
		if ((page.url.searchParams.get('tab') ?? 'plan') === tab) return;
		const url = new URL(page.url.href);
		if (tab === 'plan') url.searchParams.delete('tab');
		else url.searchParams.set('tab', tab);
		goto(url, { replace: true, reset: false });
	}
	// Saving a form lands back on the bare trip URL; put the open tab back in it.
	afterNavigate(syncUrl);
	const dueCount = $derived(
		data.expenses.filter((e) => !e.transfer && e.paymentStatus === 'due').length
	);
	const packed = $derived(data.packing.filter((i) => i.packed).length);

	let copied = $state<string | null>(null);
	async function copy(token: string, url: string) {
		await navigator.clipboard?.writeText(url);
		copied = token;
		setTimeout(() => copied === token && (copied = null), 2000);
	}

	let editing = $state(false);
	let adding = $state(false);
	$effect(() => {
		if (form?.tripError) editing = true;
		if (form?.itemError || form?.flightError) adding = true;
	});

	// Links like "#entry-flight-…" (from the journey view) point into the list: open it first.
	let listEl = $state<HTMLDetailsElement>();
	onMount(() => {
		const open = () => {
			if (!location.hash.startsWith('#entry-')) return;
			tab = 'plan';
			requestAnimationFrame(() => {
				if (listEl) listEl.open = true;
				document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
			});
		};
		open();
		addEventListener('hashchange', open);
		return () => removeEventListener('hashchange', open);
	});

	const loadsFor = (flightId: string) => data.loads.filter((l) => l.flightId === flightId);
	const best = $derived(
		bestOptions(
			data.timeline.days.flatMap((d) =>
				d.entries.flatMap((e) => (e.type === 'flight' ? [e.flight] : []))
			),
			data.loads
		)
	);
	const ODDS_STYLES: Record<Odds, string> = {
		good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
		tight: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
		unlikely: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
	};
	const time = (d: Date) => formatStamp(d);
	const COST_TONES: Record<CostTone, string> = {
		paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
		due: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
		overdue: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
	};
	// Close the cost editor once it has saved.
	const closeOnSave: SubmitFunction =
		({ formElement }) =>
		async ({ update, result }) => {
			await update({ reset: false });
			if (result.type === 'success') formElement.closest('details')?.removeAttribute('open');
		};
</script>

{#snippet remove(action: string, name: string, id: string, what: string)}
	<form method="POST" {action} use:enhance class="mt-1 text-right">
		<input type="hidden" {name} value={id} />
		<button
			class="min-h-8 px-1 text-xs text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
			>Remove {what}</button
		>
	</form>
{/snippet}

{#snippet fares(f: Flight)}
	{@const links = priceLinks(f.origin, f.destination, f.departureDate)}
	<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
		{#if f.arrivalTime}
			Lands {f.arrivalTime}{f.durationMinutes
				? ` · ${formatDuration(f.durationMinutes)} gate to gate`
				: ''} ·
		{/if}
		Fares:
		<a href={links.google} target="_blank" rel="noopener noreferrer" class="underline"
			>Google Flights</a
		>
		·
		<a href={links.skyscanner} target="_blank" rel="noopener noreferrer" class="underline"
			>Skyscanner</a
		>
	</p>
{/snippet}

{#snippet cost(target: 'flight' | 'item', x: Flight | TimelineItem)}
	{@const linked = data.expenses.find((e) =>
		target === 'flight' ? e.flightId === x.id : e.itemId === x.id
	)}
	{@const c = describeCost(costOf(linked), data.today)}
	<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
		{#if c}
			<span class="font-medium tabular-nums">💳 {c.amount}</span>
			<span class={['rounded px-2 py-0.5 text-xs font-medium', COST_TONES[c.tone]]}>{c.status}</span
			>
			{#if c.tone !== 'paid' && linked}
				<form method="POST" action="?/markPaid" use:enhance>
					<input type="hidden" name="id" value={linked.id} />
					<button class="text-xs text-blue-900 hover:underline dark:text-blue-300">Mark paid</button
					>
				</form>
			{/if}
		{/if}
		<details class="w-full" open={form?.costFor === x.id}>
			<summary class="cursor-pointer text-xs text-slate-500 select-none dark:text-slate-400"
				>{c ? 'Change cost' : 'Add cost'}</summary
			>
			<form
				method="POST"
				action="?/setCost"
				use:enhance={closeOnSave}
				class="mt-2 grid grid-cols-6 gap-2 text-sm"
			>
				<input type="hidden" name="target" value={target} />
				<input type="hidden" name="id" value={x.id} />
				<CostFields
					cost={costOf(linked)}
					paidBy={linked?.paidBy}
					members={data.money.members}
					currency={data.lastCurrency}
				/>
				<button
					class="col-span-3 rounded-lg bg-blue-900 px-3 py-1.5 font-medium text-white hover:bg-blue-800"
					>Save cost</button
				>
				{#if c}
					<button
						name="clear"
						value="1"
						class="col-span-3 rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600"
						>Remove cost</button
					>
				{/if}
			</form>
			{#if form?.costFor === x.id}
				<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.costError}</p>
			{/if}
		</details>
	</div>
{/snippet}

{#snippet attach(target: 'item' | 'flight', id: string)}
	<Attachments
		tripId={data.trip.id}
		{target}
		{id}
		attachments={data.attachments.filter((a) => (target === 'item' ? a.itemId : a.flightId) === id)}
		error={form?.attachFor === id ? form.attachError : null}
	/>
{/snippet}

{#snippet standby(f: Flight)}
	{#if f.standby}
		{@const loads = loadsFor(f.id)}
		{@const rated = oddsFor(loads)}
		<div class="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
			{#if rated}
				<div class="flex flex-wrap items-center gap-2 text-sm">
					<span class={['rounded px-2 py-0.5 font-medium', ODDS_STYLES[rated.odds]]}>
						{ODDS_LABELS[rated.odds]}
					</span>
					<span class="text-slate-500 dark:text-slate-400">
						{rated.margin >= 0
							? `${rated.margin} spare after the list`
							: `${-rated.margin} more listed than seats`}
					</span>
					{#if best.has(f.id)}
						<span
							class="rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
						>
							★ Best option for this leg
						</span>
					{/if}
				</div>
			{/if}
			{#if loads.length > 0}
				<ul class="space-y-1 text-sm">
					{#each loads as l (l.id)}
						<li class="flex flex-wrap gap-x-3">
							<span class="text-slate-400 dark:text-slate-500">{time(l.recordedAt)}</span>
							<span class="capitalize">{l.cabin}</span>
							<span class="font-medium">{l.seatsAvailable} open</span>
							{#if l.standbyListed !== null}<span>{l.standbyListed} listed</span>{/if}
							{#if l.note}<span class="text-slate-500 dark:text-slate-400">{l.note}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<form
				method="POST"
				action="?/logLoad"
				use:enhance
				class="flex flex-wrap items-end gap-2 text-sm"
			>
				<input type="hidden" name="flightId" value={f.id} />
				<select name="cabin" aria-label="Cabin">
					<option value="economy">Economy</option>
					<option value="premium">Premium</option>
					<option value="business">Business</option>
					<option value="first">First</option>
				</select>
				<input
					name="seatsAvailable"
					type="number"
					min="0"
					required
					placeholder="Open seats"
					class="w-28"
				/>
				<input name="standbyListed" type="number" min="0" placeholder="Listed" class="w-24" />
				<input name="note" placeholder="Note" class="min-w-0 flex-1" />
				<button class="rounded-lg bg-amber-500 px-3 py-2 font-medium text-white">Log load</button>
				{#if form?.loadError && form.flightId === f.id}
					<p class="w-full text-red-600 dark:text-red-400">{form.loadError}</p>
				{/if}
			</form>
			<details class="text-sm">
				<summary class="cursor-pointer text-blue-900 dark:text-blue-300">
					Add a backup flight on {f.origin} → {f.destination}
				</summary>
				<form method="POST" action="?/addFlight" use:enhance class="mt-2 flex flex-wrap gap-2">
					<input type="hidden" name="origin" value={f.origin} />
					<input type="hidden" name="destination" value={f.destination} />
					<input type="hidden" name="departureDate" value={f.departureDate} />
					<input type="hidden" name="standby" value="on" />
					<input
						name="flightNumber"
						required
						placeholder="LH1172"
						aria-label="Backup flight number"
						class="w-28"
					/>
					<input name="departureTime" type="time" aria-label="Backup departure time" />
					<button
						class="rounded-lg border border-blue-900 px-3 py-2 font-medium text-blue-900 dark:border-blue-300 dark:text-blue-300"
					>
						Add backup
					</button>
				</form>
			</details>
		</div>
	{/if}
{/snippet}

<svelte:head>
	<title>{data.trip.title} · Jumpseat</title>
</svelte:head>

<div class="flex items-center justify-between gap-2 text-sm">
	<a href="/" class="py-1 text-blue-900 hover:underline dark:text-blue-300">← All trips</a>
	<button
		type="button"
		onclick={() => (editing = !editing)}
		aria-expanded={editing}
		class="rounded-full px-3 py-1 font-medium text-blue-900 hover:bg-blue-900/5 dark:text-blue-300 dark:hover:bg-white/5"
		>{editing ? 'Close' : '✏️ Edit trip'}</button
	>
</div>
<TripHero
	id={data.trip.id}
	title={data.trip.title}
	when={data.trip}
	today={data.today}
	route={data.route}
	timezone={data.trip.timezone}
/>

{#if editing}
	<section class="card animate-rise">
		<h2 class="text-lg font-semibold">Edit trip</h2>
		<form
			method="POST"
			action="?/update"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
			class="mt-3 grid gap-3 sm:grid-cols-2"
		>
			<label class="flex flex-col gap-1 text-sm">
				Name
				<input name="title" required value={data.trip.title} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				Destination
				<input name="destination" required value={data.trip.destination} />
			</label>
			{#key data.trip}
				<StopsField stops={readStops(data.trip.stops)} />
			{/key}
			<OriginField value={data.trip.origin} />
			{#key data.trip}
				<TripWhenFields when={data.trip} today={data.today} />
			{/key}
			{#if form?.tripError}
				<p class="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{form.tripError}</p>
			{/if}
			<button
				class="rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800 sm:col-span-2"
			>
				Save
			</button>
		</form>
		<form
			method="POST"
			action="?/delete"
			onsubmit={(e) => {
				if (!confirm('Delete this trip and everything on it?')) e.preventDefault();
			}}
			class="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700"
		>
			<button class="py-1 text-sm text-red-600 hover:underline dark:text-red-400"
				>Delete trip</button
			>
		</form>
	</section>
{/if}

<nav
	class="sticky top-0 z-30 -mx-4 bg-paper/85 px-4 py-2 backdrop-blur dark:bg-ink-950/85"
	aria-label="Trip sections"
>
	<div class="grid grid-cols-4 gap-1 rounded-2xl bg-slate-900/5 p-1 dark:bg-white/5" role="tablist">
		{#each TABS as t (t.id)}
			<button
				type="button"
				role="tab"
				aria-selected={tab === t.id}
				onclick={() => show(t.id)}
				class={[
					'relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-xs font-semibold transition sm:flex-row sm:justify-center sm:gap-2 sm:text-sm',
					tab === t.id
						? 'bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white'
						: 'text-slate-600 hover:bg-white/50 dark:text-slate-300 dark:hover:bg-white/5'
				]}
			>
				<span class="text-base leading-none" aria-hidden="true">{t.icon}</span>
				{t.label}
				{#if t.id === 'money' && dueCount}
					<span
						class="absolute top-1 right-1 rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 text-white sm:static"
						aria-label="{dueCount} to pay">{dueCount}</span
					>
				{:else if t.id === 'packing' && data.packing.length}
					<span class="font-mono text-[10px] font-normal text-slate-500 dark:text-slate-400"
						>{packed}/{data.packing.length}</span
					>
				{/if}
			</button>
		{/each}
	</div>
</nav>

{#if tab === 'plan'}
	<div class="grid gap-3 sm:grid-cols-2">
		<a
			href="/trips/{data.trip.id}/journey"
			class="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-ink-900 p-4 text-white shadow-lg transition hover:shadow-xl"
		>
			<span
				class="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,transparent_40%,rgb(246_178_60/0.25))]"
				aria-hidden="true"
			></span>
			<span
				class="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-runway text-2xl text-ink-950 transition group-hover:scale-110"
				aria-hidden="true">🗺️</span
			>
			<span class="relative min-w-0 flex-1">
				<span class="block font-display text-lg font-bold">Open the journey</span>
				<span class="block text-sm text-white/70"
					>Day by day, full screen. Drag ideas onto the days.</span
				>
			</span>
		</a>
		<a
			href="/trips/{data.trip.id}/plan"
			class="group flex items-center gap-4 rounded-2xl bg-linear-to-r from-blue-900 to-violet-700 p-4 text-white shadow-lg transition hover:shadow-xl"
		>
			<span
				class="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl transition group-hover:scale-110"
				aria-hidden="true">✨</span
			>
			<span class="min-w-0 flex-1">
				<span class="block font-display text-lg font-bold">Plan with AI</span>
				<span class="block text-sm text-blue-100"
					>A day-by-day draft from your style and budget.</span
				>
			</span>
		</a>
	</div>

	<section class="card space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-lg font-semibold">Timeline</h2>
			<a
				href="/trips/{data.trip.id}/calendar.ics"
				download
				class="py-1 text-sm text-blue-900 hover:underline dark:text-blue-300">📅 Add to calendar</a
			>
		</div>
		{#if data.gantt}
			<TripTimeline
				gantt={data.gantt}
				tripStart={data.schedule.start}
				undated={data.schedule.undated}
			/>
		{/if}
		<details bind:this={listEl} class="group/list">
			<summary
				class="cursor-pointer text-sm font-semibold text-slate-500 select-none dark:text-slate-400"
			>
				List view <span class="font-normal">· standby loads, details and removing entries</span>
			</summary>
			<div class="pt-4">
				<TimelineView
					timeline={data.timeline}
					tripStart={data.schedule.start}
					undated={data.schedule.undated}
				>
					{#snippet extra(entry)}
						{#if entry.type === 'flight'}
							{@render fares(entry.flight)}
							{@render cost('flight', entry.flight)}
							{@render attach('flight', entry.flight.id)}
							{@render standby(entry.flight)}
							{@render remove('?/deleteFlight', 'flightId', entry.flight.id, 'flight')}
						{:else if entry.phase !== 'end'}
							{@render cost('item', entry.item)}
							{@render attach('item', entry.item.id)}
							{@render remove('?/deleteItem', 'itemId', entry.item.id, 'entry')}
						{/if}
					{/snippet}
					{#snippet itemExtra(item)}
						{@render cost('item', item)}
						{@render attach('item', item.id)}
						{@render remove('?/deleteItem', 'itemId', item.id, 'entry')}
					{/snippet}
				</TimelineView>
			</div>
		</details>
		{#if adding}
			<div class="relative">
				<AddToTimeline
					error={form?.itemError ?? form?.flightError}
					today={data.today}
					tripStart={data.trip.startDate}
					lookup={data.flightLookup}
					currency={data.lastCurrency}
					members={data.money.members}
				/>
				<button
					type="button"
					onclick={() => (adding = false)}
					class="absolute top-2 right-0 rounded-full px-3 py-1 text-sm text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/5"
					>Done</button
				>
			</div>
		{:else}
			<button
				type="button"
				onclick={() => (adding = true)}
				class="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 font-semibold text-blue-900 transition hover:border-blue-900 hover:bg-blue-900/5 dark:border-slate-600 dark:text-blue-300 dark:hover:border-blue-300"
			>
				+ Add a flight, stay or plan
			</button>
		{/if}
	</section>

	{#if data.trip.latitude !== null && data.weather}
		<Weather weather={data.weather} place={data.trip.destination} />
	{:else}
		<p class="card text-sm text-slate-500 dark:text-slate-400">
			Weather will show once "{data.trip.destination}" can be found on the map. Check the spelling,
			or try again when you are online.
		</p>
	{/if}

	{#if data.trip.latitude !== null}
		<ThingsToDo
			sights={data.sights}
			place={data.trip.destination}
			planned={[
				...data.timeline.days.flatMap((d) =>
					d.entries.flatMap((e) => (e.type === 'item' ? [e.item.title] : []))
				),
				...data.timeline.unscheduled.map((i) => i.title)
			]}
		/>
	{/if}
{:else if tab === 'money'}
	<Expenses
		expenses={data.expenses}
		today={data.today}
		error={form?.expenseError}
		lastCurrency={form?.expenseCurrency}
		money={data.money}
		tripId={data.trip.id}
		attachments={data.attachments}
		memberError={form?.memberError}
		attachError={form?.attachError ? { id: form.attachFor, message: form.attachError } : null}
	/>
{:else if tab === 'packing'}
	<PackingList items={data.packing} weather={data.weather} error={form?.packingError} />
{:else}
	<section class="card space-y-3">
		<h2 class="text-lg font-semibold">Sharing</h2>
		<p class="text-sm text-slate-500 dark:text-slate-400">
			Anyone with a link sees this trip's plan and weather, without access to the rest of Jumpseat.
			With an <strong>editable</strong> link they can also plan along in the journey view: add ideas,
			move things around and set times. Standby loads and booking references stay private.
		</p>
		{#each data.shares as s (s.token)}
			<form
				method="POST"
				action="?/revokeShare"
				use:enhance
				class="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2 text-sm dark:bg-slate-800/60"
			>
				<input type="hidden" name="token" value={s.token} />
				<span
					class={[
						'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
						s.canEdit
							? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
							: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
					]}>{s.canEdit ? 'Can edit' : 'View only'}</span
				>
				<input
					readonly
					value={s.url}
					class="min-w-0 flex-[1_1_12rem] font-mono text-xs"
					aria-label="Share link"
					onfocus={(e) => e.currentTarget.select()}
				/>
				<span class="ml-auto flex gap-2">
					<button
						type="button"
						onclick={() => copy(s.token, s.url)}
						class="min-h-9 rounded-lg bg-blue-900 px-3 font-medium text-white hover:bg-blue-800"
						aria-live="polite">{copied === s.token ? 'Copied ✓' : 'Copy link'}</button
					>
					<button
						class="min-h-9 rounded-lg px-3 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
						>Revoke</button
					>
				</span>
			</form>
		{/each}
		<form method="POST" action="?/share" use:enhance class="flex flex-wrap gap-2">
			<button
				name="canEdit"
				value=""
				class="rounded-lg border border-blue-900 px-3 py-2 text-sm font-medium text-blue-900 dark:border-blue-300 dark:text-blue-300"
			>
				Create view-only link
			</button>
			<button
				name="canEdit"
				value="on"
				class="rounded-lg border border-amber-600 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-400 dark:text-amber-300"
			>
				Create editable link
			</button>
		</form>
	</section>
{/if}
