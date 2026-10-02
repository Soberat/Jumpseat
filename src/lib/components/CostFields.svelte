<script lang="ts">
	import { untrack } from 'svelte';
	import { DEFAULT_CURRENCY, type Cost } from '#lib/cost.ts';
	import { minorDigits, COMMON_CURRENCIES } from '#lib/money.ts';

	let { cost = null, currency = DEFAULT_CURRENCY }: { cost?: Cost | null; currency?: string } =
		$props();

	const uid = $props.id();
	const amountOf = (c: Cost | null) =>
		c?.costMinor != null && c.costCurrency
			? (c.costMinor / 10 ** minorDigits(c.costCurrency))
					.toFixed(minorDigits(c.costCurrency))
					.replace('.', ',')
			: '';
	let status = $state(untrack(() => cost?.paymentStatus ?? 'paid'));
</script>

<fieldset class="col-span-full grid grid-cols-6 gap-2">
	<legend class="mb-1"
		>Cost <span class="text-slate-500 dark:text-slate-400">(optional)</span></legend
	>
	<input
		name="costAmount"
		inputmode="decimal"
		placeholder="0,00"
		aria-label="Cost"
		defaultValue={amountOf(cost)}
		class="col-span-4 sm:col-span-2"
	/>
	<input
		name="costCurrency"
		maxlength="3"
		list="{uid}-currencies"
		defaultValue={cost?.costCurrency ?? currency}
		aria-label="Currency"
		class="col-span-2 uppercase sm:col-span-1"
	/>
	<datalist id="{uid}-currencies">
		{#each COMMON_CURRENCIES as c (c)}<option value={c}></option>{/each}
	</datalist>
	<select
		name="paymentStatus"
		bind:value={status}
		aria-label="Payment"
		class={status === 'due' ? 'col-span-3 sm:col-span-1' : 'col-span-6 sm:col-span-3'}
	>
		<option value="paid">Paid</option>
		<option value="due">To pay</option>
	</select>
	{#if status === 'due'}
		<label class="col-span-3 flex items-center gap-2 sm:col-span-2">
			<span class="shrink-0">by</span>
			<input
				type="date"
				name="dueDate"
				defaultValue={cost?.dueDate ?? ''}
				aria-label="Pay by"
				class="min-w-0 flex-1"
			/>
		</label>
	{/if}
</fieldset>
