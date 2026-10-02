<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { normaliseFlightNumber, priceLinks, type FlightInfo } from '#lib/flight-info.ts';
	import DateRangePicker from './DateRangePicker.svelte';
	import CostFields from './CostFields.svelte';
	import { KIND_LABELS, MODE_LABELS, TIMELINE_KINDS, TRANSPORT_MODES } from '#lib/timeline.ts';

	let {
		error,
		today,
		tripStart,
		lookup = false,
		currency
	}: {
		error?: string;
		today: string;
		tripStart?: string | null;
		/** Flight lookup by number is set up on the server. */
		lookup?: boolean;
		/** Default for the cost fields: the last one used on this trip. */
		currency?: string;
	} = $props();

	// Bumped after each successful add, so the cost fields start empty again.
	let added = $state(0);

	// Flight form, filled by hand or from a schedule lookup.
	let flightNumber = $state('');
	let origin = $state('');
	let destination = $state('');
	let departureDate = $state(untrack(() => tripStart ?? ''));
	let departureTime = $state('');
	let arrival = $state<{ date: string | null; time: string | null; minutes: number | null }>({
		date: null,
		time: null,
		minutes: null
	});
	let found = $state<FlightInfo[]>([]);
	let lookupNote = $state<string | null>(null);
	let looking = $state(false);
	const prices = $derived(
		origin.length === 3 && destination.length === 3 && departureDate
			? priceLinks(origin.toUpperCase(), destination.toUpperCase(), departureDate)
			: null
	);

	function useFlight(f: FlightInfo) {
		origin = f.origin;
		destination = f.destination;
		departureDate = f.departureDate;
		departureTime = f.departureTime;
		arrival = { date: f.arrivalDate, time: f.arrivalTime, minutes: f.durationMinutes };
		lookupNote = [
			f.airline,
			`${f.originName ?? f.origin} ${f.departureTime} → ${f.destinationName ?? f.destination} ${f.arrivalTime ?? ''}`.trim(),
			f.aircraft,
			f.terminal ? `Terminal ${f.terminal}` : null
		]
			.filter(Boolean)
			.join(' · ');
	}

	async function lookUp() {
		const number = normaliseFlightNumber(flightNumber);
		if (!number || !departureDate) {
			lookupNote = 'Type the flight number and pick the date first.';
			return;
		}
		looking = true;
		lookupNote = null;
		found = [];
		try {
			const res = await fetch(`/api/flight-lookup?number=${number}&date=${departureDate}`);
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message);
			const { flights } = (await res.json()) as { flights: FlightInfo[] };
			if (flights.length === 0) lookupNote = `No ${number} found on that date. Fill it in by hand.`;
			else {
				found = flights;
				useFlight(flights[0]);
			}
		} catch (e) {
			lookupNote = (e as Error).message || 'Lookup failed. Fill it in by hand.';
		} finally {
			looking = false;
		}
	}

	type Choice = 'flight' | (typeof TIMELINE_KINDS)[number];
	const CHOICES: Choice[] = ['flight', ...TIMELINE_KINDS];
	const ICONS: Record<Choice, string> = {
		flight: '✈️',
		stay: '🏨',
		car: '🚗',
		transport: '🚆',
		restaurant: '🍽️',
		other: '📌'
	};

	let kind = $state<Choice>('stay');
	const spans = $derived(kind === 'stay' || kind === 'car');
	const placeholders: Record<Choice, string> = {
		flight: '',
		stay: 'Hotel Avenida',
		car: 'Sixt, compact',
		transport: 'Optional, e.g. Airport taxi',
		restaurant: 'Taberna da Rua das Flores',
		other: 'Fado show'
	};
	const startLabel = $derived(kind === 'stay' ? 'Check-in' : kind === 'car' ? 'Pick-up' : 'Date');
	const endLabel = $derived(kind === 'stay' ? 'Check-out' : 'Drop-off');
</script>

<div class="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-700">
	<h3 class="font-semibold">Add to the timeline</h3>
	<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="What to add">
		{#each CHOICES as c (c)}
			<button
				type="button"
				role="radio"
				aria-checked={kind === c}
				onclick={() => (kind = c)}
				class={[
					'rounded-full border px-3 py-1 text-sm',
					kind === c
						? 'border-blue-900 bg-blue-900 text-white dark:border-blue-300 dark:bg-blue-300 dark:text-slate-900'
						: 'border-slate-300 dark:border-slate-600'
				]}
			>
				{ICONS[c]}
				{KIND_LABELS[c]}
			</button>
		{/each}
	</div>

	{#if kind === 'flight'}
		<form
			method="POST"
			action="?/addFlight"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						flightNumber = origin = destination = departureTime = '';
						arrival = { date: null, time: null, minutes: null };
						found = [];
						lookupNote = null;
						added++;
					}
				}}
			class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6"
		>
			<input
				name="flightNumber"
				required
				placeholder="LH1366"
				aria-label="Flight number"
				bind:value={flightNumber}
			/>
			<input
				name="departureDate"
				type="date"
				required
				aria-label="Date"
				bind:value={departureDate}
			/>
			{#if lookup}
				<button
					type="button"
					onclick={lookUp}
					disabled={looking}
					class="col-span-2 rounded-lg border border-blue-900 px-3 py-2 font-medium text-blue-900 hover:bg-blue-50 disabled:opacity-60 sm:col-span-2 dark:border-blue-300 dark:text-blue-300 dark:hover:bg-blue-950"
					>{looking ? 'Looking up…' : '🔎 Look up flight'}</button
				>
			{/if}
			<span class={['hidden', lookup ? 'sm:hidden' : 'sm:col-span-2 sm:block']}></span>
			<input
				name="origin"
				required
				maxlength="4"
				placeholder="KRK"
				aria-label="From"
				bind:value={origin}
			/>
			<input
				name="destination"
				required
				maxlength="4"
				placeholder="MUC"
				aria-label="To"
				bind:value={destination}
			/>
			<input
				name="departureTime"
				type="time"
				aria-label="Departure time"
				bind:value={departureTime}
			/>
			<input type="hidden" name="arrivalDate" value={arrival.date ?? ''} />
			<input type="hidden" name="arrivalTime" value={arrival.time ?? ''} />
			<input type="hidden" name="durationMinutes" value={arrival.minutes ?? ''} />
			<label class="flex items-center gap-2">
				<input type="checkbox" name="standby" checked /> Standby
			</label>
			{#key added}<CostFields {currency} />{/key}
			{#if lookupNote}
				<p class="col-span-full text-sm text-slate-600 dark:text-slate-300">{lookupNote}</p>
			{/if}
			{#if found.length > 1}
				<div class="col-span-full flex flex-wrap gap-1.5">
					{#each found as f (f.origin + f.destination)}
						<button
							type="button"
							onclick={() => useFlight(f)}
							class={[
								'rounded-full border px-2.5 py-0.5 font-mono text-xs',
								origin === f.origin && destination === f.destination
									? 'border-blue-900 bg-blue-900 text-white'
									: 'border-slate-300 dark:border-slate-600'
							]}>{f.origin} → {f.destination}</button
						>
					{/each}
				</div>
			{/if}
			{#if prices}
				<p class="col-span-full text-xs text-slate-500 dark:text-slate-400">
					Fares for this route:
					<a href={prices.google} target="_blank" rel="noopener noreferrer" class="underline"
						>Google Flights</a
					>
					·
					<a href={prices.skyscanner} target="_blank" rel="noopener noreferrer" class="underline"
						>Skyscanner</a
					>
				</p>
			{/if}
			<button
				class="col-span-full rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
			>
				Add flight
			</button>
		</form>
	{:else}
		<form
			method="POST"
			action="?/addItem"
			use:enhance={() =>
				async ({ update, result }) => {
					await update();
					if (result.type === 'success') added++;
				}}
			class="grid grid-cols-2 gap-2 text-sm"
		>
			<input type="hidden" name="kind" value={kind} />
			<label class="col-span-full flex flex-col gap-1">
				Name
				<input name="title" required={kind !== 'transport'} placeholder={placeholders[kind]} />
			</label>

			{#if kind === 'transport'}
				<label class="col-span-full flex flex-col gap-1">
					How
					<select name="mode">
						{#each TRANSPORT_MODES as m (m)}
							<option value={m}>{MODE_LABELS[m]}</option>
						{/each}
					</select>
				</label>
				<label class="flex flex-col gap-1">
					From <input name="fromPlace" placeholder="Lisbon Oriente" />
				</label>
				<label class="flex flex-col gap-1">
					To <input name="toPlace" placeholder="Sintra" />
				</label>
			{:else}
				<label class="col-span-full flex flex-col gap-1">
					{kind === 'car' ? 'Pick-up location' : 'Address or area'}
					<input name="location" />
				</label>
			{/if}

			{#if spans}
				<div class="col-span-full">
					<DateRangePicker {today} openAt={tripStart} {startLabel} {endLabel} />
				</div>
				<label class="flex flex-col gap-1">
					{startLabel} time
					<input type="time" name="startTime" />
				</label>
				<label class="flex flex-col gap-1">
					{endLabel} time
					<input type="time" name="endTime" />
				</label>
			{:else}
				<label class="flex flex-col gap-1">
					{startLabel}
					<input type="date" name="startDate" />
				</label>
				<label class="flex flex-col gap-1">
					Time
					<input type="time" name="startTime" />
				</label>
				<label class="col-span-full flex flex-col gap-1 sm:col-span-1">
					How long
					<input name="duration" placeholder="e.g. 45m, 1h30" inputmode="text" />
				</label>
			{/if}

			<label class="flex flex-col gap-1">
				Booking reference <input name="reference" />
			</label>
			<label class="flex flex-col gap-1">
				Link <input name="url" type="url" placeholder="https://" />
			</label>
			{#key added}<CostFields {currency} />{/key}
			<label class="col-span-full flex flex-col gap-1">
				Notes <textarea name="notes" rows="2"></textarea>
			</label>
			{#key kind}
				<label class="col-span-full flex items-center gap-2">
					<input type="checkbox" name="status" value="idea" checked={kind === 'restaurant'} />
					Just an idea for now (not booked)
				</label>
			{/key}
			<button
				class="col-span-full rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
			>
				Add {KIND_LABELS[kind].toLowerCase()}
			</button>
		</form>
	{/if}
	{#if error}
		<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
</div>
