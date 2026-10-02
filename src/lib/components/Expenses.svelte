<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		CATEGORY_LABELS,
		COMMON_CURRENCIES,
		EXPENSE_CATEGORIES,
		formatMoney,
		totalsByCurrency
	} from '#lib/money.ts';
	import type { Expense } from '#lib/server/db/schema.ts';

	let {
		expenses,
		today,
		error,
		lastCurrency
	}: { expenses: Expense[]; today: string; error?: string; lastCurrency?: string } = $props();

	const totals = $derived(totalsByCurrency(expenses));
	// Default to what you used last on this trip; most trips are in one currency.
	const defaultCurrency = $derived(lastCurrency ?? expenses[0]?.currency ?? 'EUR');
	const byCategory = $derived(
		EXPENSE_CATEGORIES.map((c) => ({
			category: c,
			totals: totalsByCurrency(expenses.filter((e) => e.category === c))
		})).filter((c) => c.totals.length > 0)
	);
	const dateLabel = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
</script>

<section class="card space-y-3">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-semibold">Expenses</h2>
		{#if totals.length > 0}
			<span class="text-lg font-semibold tabular-nums">
				{totals.map((t) => formatMoney(t.minor, t.currency)).join(' + ')}
			</span>
		{/if}
	</div>

	{#if byCategory.length > 1}
		<ul class="flex flex-wrap gap-2 text-sm">
			{#each byCategory as c (c.category)}
				<li class="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700">
					{CATEGORY_LABELS[c.category]}:
					<span class="font-medium tabular-nums">
						{c.totals.map((t) => formatMoney(t.minor, t.currency)).join(' + ')}
					</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if expenses.length > 0}
		<ul class="divide-y divide-slate-100 text-sm dark:divide-slate-700">
			{#each expenses as e (e.id)}
				<li class="flex items-center gap-3 py-1.5">
					<span class="w-6 text-center" aria-hidden="true"
						>{CATEGORY_LABELS[e.category].split(' ')[0]}</span
					>
					<span class="min-w-0 flex-1">
						{e.description}
						{#if e.spentOn}
							<span class="text-slate-500 dark:text-slate-400"> · {dateLabel(e.spentOn)}</span>
						{/if}
					</span>
					<span class="font-medium tabular-nums">{formatMoney(e.amountMinor, e.currency)}</span>
					<form method="POST" action="?/deleteExpense" use:enhance>
						<input type="hidden" name="id" value={e.id} />
						<button
							class="px-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
							aria-label="Remove {e.description}">×</button
						>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-slate-500 dark:text-slate-400">
			Nothing logged yet. Amounts stay in the currency you paid in.
		</p>
	{/if}

	<form method="POST" action="?/addExpense" use:enhance class="grid grid-cols-6 gap-2 text-sm">
		<input
			name="description"
			required
			placeholder="Dinner at Ramiro"
			aria-label="What for"
			class="col-span-6 sm:col-span-3"
		/>
		<input
			name="amount"
			required
			inputmode="decimal"
			placeholder="0.00"
			aria-label="Amount"
			class="col-span-3 sm:col-span-2"
		/>
		<input
			name="currency"
			required
			maxlength="3"
			list="currencies"
			defaultValue={defaultCurrency}
			aria-label="Currency"
			class="col-span-3 uppercase sm:col-span-1"
		/>
		<datalist id="currencies">
			{#each COMMON_CURRENCIES as c (c)}<option value={c}></option>{/each}
		</datalist>
		<select name="category" aria-label="Category" class="col-span-3">
			{#each EXPENSE_CATEGORIES as c (c)}
				<option value={c} selected={c === 'food'}>{CATEGORY_LABELS[c]}</option>
			{/each}
		</select>
		<input name="spentOn" type="date" defaultValue={today} aria-label="Date" class="col-span-3" />
		<button
			class="col-span-6 rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
		>
			Add expense
		</button>
	</form>
	{#if error}<p class="text-sm text-red-600 dark:text-red-400">{error}</p>{/if}
</section>
