<script lang="ts">
	import { enhance } from '$app/forms';
	import { KIND_LABELS, MODE_LABELS, TIMELINE_KINDS, TRANSPORT_MODES } from '#lib/timeline.ts';

	let { error }: { error?: string } = $props();

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
			use:enhance
			class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-6"
		>
			<input name="flightNumber" required placeholder="LH400" aria-label="Flight number" />
			<input name="origin" required maxlength="4" placeholder="FRA" aria-label="From" />
			<input name="destination" required maxlength="4" placeholder="JFK" aria-label="To" />
			<input name="departureDate" type="date" required aria-label="Date" />
			<input name="departureTime" type="time" aria-label="Departure time" />
			<label class="flex items-center gap-2">
				<input type="checkbox" name="standby" checked /> Standby
			</label>
			<button
				class="col-span-full rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
			>
				Add flight
			</button>
		</form>
	{:else}
		<form method="POST" action="?/addItem" use:enhance class="grid grid-cols-2 gap-2 text-sm">
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

			<label class="flex flex-col gap-1">
				{startLabel}
				<input type="date" name="startDate" />
			</label>
			<label class="flex flex-col gap-1">
				Time
				<input type="time" name="startTime" />
			</label>
			{#if spans}
				<label class="flex flex-col gap-1">
					{endLabel}
					<input type="date" name="endDate" />
				</label>
				<label class="flex flex-col gap-1">
					Time
					<input type="time" name="endTime" />
				</label>
			{/if}

			<label class="flex flex-col gap-1">
				Booking reference <input name="reference" />
			</label>
			<label class="flex flex-col gap-1">
				Link <input name="url" type="url" placeholder="https://" />
			</label>
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
