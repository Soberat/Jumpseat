<script lang="ts">
	import { LOCALE, formatNumericDate } from '#lib/format.ts';
	import { enhance } from '$app/forms';
	import {
		CATEGORY_LABELS,
		COMMON_CURRENCIES,
		EXPENSE_CATEGORIES,
		formatMoney,
		totalsByCurrency
	} from '#lib/money.ts';
	import { splitIds, type Settlement } from '#lib/settle.ts';
	import type { Attachment, Expense, TripMember } from '#lib/server/db/schema.ts';
	import type { CostSummary } from '#lib/cost.ts';
	import Attachments from './Attachments.svelte';

	type Converted = { minor: number; missing: number };
	let {
		expenses,
		today,
		error,
		lastCurrency,
		bookings = null,
		money,
		tripId,
		attachments,
		memberError,
		attachError = null
	}: {
		expenses: Expense[];
		today: string;
		error?: string;
		lastCurrency?: string;
		/** Costs entered on flights, stays and the rest of the timeline. */
		bookings?: CostSummary | null;
		money: {
			members: TripMember[];
			settleCurrency: string;
			settlement: Settlement;
			total: Converted;
			bookingsPaid: Converted;
			bookingsDue: Converted;
			ratesMissing: boolean;
		};
		tripId: string;
		attachments: Attachment[];
		memberError?: string;
		attachError?: { id: string; message: string } | null;
	} = $props();

	const cur = $derived(money.settleCurrency);
	const sum = (t: { minor: number; currency: string }[]) =>
		t.map((x) => formatMoney(x.minor, x.currency)).join(' + ');
	const approx = (c: Converted) => `≈ ${formatMoney(c.minor, cur)}${c.missing ? '*' : ''}`;

	const spent = $derived(expenses.filter((e) => !e.transfer));
	const totals = $derived(totalsByCurrency(spent));
	// Worth showing a converted total once anything isn't in the settle currency.
	const mixed = $derived(spent.some((e) => e.currency !== cur));
	const bookingsMixed = $derived(
		!!bookings && [...bookings.paid, ...bookings.due].some((t) => t.currency !== cur)
	);
	// Default to what you used last on this trip; most trips are in one currency.
	const defaultCurrency = $derived(lastCurrency ?? expenses[0]?.currency ?? cur);
	const byCategory = $derived(
		EXPENSE_CATEGORIES.map((c) => ({
			category: c,
			totals: totalsByCurrency(spent.filter((e) => e.category === c))
		})).filter((c) => c.totals.length > 0)
	);
	const dateLabel = (d: string) =>
		new Date(`${d}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });

	const members = $derived(money.members);
	const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'someone';
	const memberIds = $derived(members.map((m) => m.id));
	const sharing = $derived(members.length >= 2);
	const anyShared = $derived(expenses.some((e) => e.paidBy));
	const settleCurrencies = $derived([...new Set([cur, 'PLN', ...COMMON_CURRENCIES])]);

	function splitNote(e: Expense): string | null {
		if (!e.paidBy) return null;
		const among = splitIds(e.splitWith, memberIds);
		if (e.transfer) return null;
		const who = `${name(e.paidBy)} paid`;
		if (among.length === memberIds.length) return `${who} · split ${among.length} ways`;
		if (among.length === 1)
			return among[0] === e.paidBy
				? `${who} · just for themselves`
				: `${who} for ${name(among[0])}`;
		return `${who} · split between ${among.map(name).join(', ')}`;
	}
	let openFor = $state<string | null>(null);
</script>

<section class="card space-y-3">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="text-lg font-semibold">Expenses</h2>
		{#if totals.length > 0}
			<span class="text-right">
				<span class="block text-lg font-semibold tabular-nums">{sum(totals)}</span>
				{#if mixed && totals.length}
					<span class="block text-xs text-slate-500 tabular-nums dark:text-slate-400"
						>{approx(money.total)} in all</span
					>
				{/if}
			</span>
		{/if}
	</div>

	{#if bookings}
		<div class="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
			<p class="font-semibold">Bookings</p>
			<p class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
				{#if bookings.paid.length}
					<span
						>Paid <span class="font-medium text-emerald-700 tabular-nums dark:text-emerald-300"
							>{sum(bookings.paid)}</span
						>{#if bookingsMixed}<span class="ml-1 text-slate-500 dark:text-slate-400">
								({approx(money.bookingsPaid)})</span
							>{/if}</span
					>
				{/if}
				{#if bookings.due.length}
					<span
						>To pay <span class="font-medium text-amber-700 tabular-nums dark:text-amber-300"
							>{sum(bookings.due)}</span
						>{#if bookingsMixed}<span class="ml-1 text-slate-500 dark:text-slate-400">
								({approx(money.bookingsDue)})</span
							>{/if}</span
					>
				{/if}
			</p>
			{#if bookings.next}
				<p class="mt-1 text-slate-600 dark:text-slate-300">
					Next: {bookings.next.label}, {bookings.next.amount} by {formatNumericDate(
						bookings.next.date
					)}
				</p>
			{/if}
			{#if bookings.overdue}
				<p class="mt-1 font-medium text-red-700 dark:text-red-300">
					{bookings.overdue} payment{bookings.overdue === 1 ? ' is' : 's are'} past the due date.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Who's on the trip, for splitting -->
	<div class="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
		<p class="font-semibold">Who's on this trip</p>
		{#if members.length}
			<ul class="mt-2 flex flex-wrap gap-1.5">
				{#each members as m (m.id)}
					<li
						class="flex items-center gap-1 rounded-full bg-white py-0.5 pr-1 pl-3 shadow-sm dark:bg-slate-700"
					>
						{m.name}
						<form method="POST" action="?/removeMember" use:enhance>
							<input type="hidden" name="id" value={m.id} />
							<button
								class="px-1 text-slate-400 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
								aria-label="Remove {m.name}">×</button
							>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-1 text-slate-500 dark:text-slate-400">
				Add yourself and the people you travel with to split costs and settle up.
			</p>
		{/if}
		<form method="POST" action="?/addMember" use:enhance class="mt-2 flex gap-2">
			<input
				name="name"
				required
				maxlength="40"
				placeholder={members.length ? 'Add someone' : 'Your name'}
				aria-label="Name"
				class="min-w-0 flex-1"
			/>
			<button class="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600"
				>Add</button
			>
		</form>
		{#if memberError}<p class="mt-1 text-red-600 dark:text-red-400">{memberError}</p>{/if}
	</div>

	{#if sharing && anyShared}
		{@const s = money.settlement}
		<div
			class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="font-semibold">Settle up</p>
				<form
					method="POST"
					action="?/setSettleCurrency"
					use:enhance
					class="flex items-center gap-1"
				>
					<label for="settle-cur" class="text-slate-500 dark:text-slate-400">in</label>
					<select
						id="settle-cur"
						name="currency"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
						class="py-0.5"
					>
						{#each settleCurrencies as c (c)}<option value={c} selected={c === cur}>{c}</option
							>{/each}
					</select>
				</form>
			</div>
			<ul class="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
				{#each s.balances as b (b.memberId)}
					<li class="flex justify-between gap-2">
						<span class="truncate">{name(b.memberId)}</span>
						<span
							class={[
								'tabular-nums',
								b.minor > 0 && 'text-emerald-700 dark:text-emerald-300',
								b.minor < 0 && 'text-rose-700 dark:text-rose-300'
							]}>{b.minor > 0 ? '+' : ''}{formatMoney(b.minor, cur)}</span
						>
					</li>
				{/each}
			</ul>
			{#if s.transfers.length}
				<ul class="mt-3 space-y-1.5">
					{#each s.transfers as t (t.from + t.to)}
						<li class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span
								><span class="font-medium">{name(t.from)}</span> pays
								<span class="font-medium">{name(t.to)}</span></span
							>
							<span class="font-semibold tabular-nums">{formatMoney(t.minor, cur)}</span>
							<form method="POST" action="?/settleTransfer" use:enhance class="ml-auto">
								<input type="hidden" name="from" value={t.from} />
								<input type="hidden" name="to" value={t.to} />
								<input type="hidden" name="minor" value={t.minor} />
								<input type="hidden" name="currency" value={cur} />
								<button class="text-xs text-blue-900 hover:underline dark:text-blue-300"
									>Mark as paid</button
								>
							</form>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-2 font-medium text-emerald-800 dark:text-emerald-200">🎉 Everyone's square.</p>
			{/if}
			{#if s.skipped}
				<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
					{s.skipped} expense{s.skipped === 1 ? '' : 's'} left out: no exchange rate for that currency.
				</p>
			{/if}
		</div>
	{/if}

	{#if byCategory.length > 1}
		<ul class="flex flex-wrap gap-2 text-sm">
			{#each byCategory as c (c.category)}
				<li class="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-700">
					{CATEGORY_LABELS[c.category]}:
					<span class="font-medium tabular-nums">{sum(c.totals)}</span>
				</li>
			{/each}
		</ul>
	{/if}

	{#if expenses.length > 0}
		<ul class="divide-y divide-slate-100 text-sm dark:divide-slate-700">
			{#each expenses as e (e.id)}
				{@const own = attachments.filter((a) => a.expenseId === e.id)}
				{@const converted = money.settlement.converted[e.id]}
				<li class={['py-1.5', e.transfer && 'text-slate-500 dark:text-slate-400']}>
					<div class="flex items-center gap-3">
						<span class="w-6 text-center" aria-hidden="true"
							>{e.transfer ? '💸' : CATEGORY_LABELS[e.category].split(' ')[0]}</span
						>
						<span class="min-w-0 flex-1">
							{e.description}
							{#if e.spentOn}
								<span class="text-slate-500 dark:text-slate-400"> · {dateLabel(e.spentOn)}</span>
							{/if}
							{#if sharing && splitNote(e)}
								<span class="block text-xs text-slate-500 dark:text-slate-400">{splitNote(e)}</span>
							{/if}
						</span>
						<span class="text-right">
							<span class="block font-medium tabular-nums"
								>{formatMoney(e.amountMinor, e.currency)}</span
							>
							{#if e.currency !== cur && converted !== null}
								<span class="block text-xs text-slate-500 tabular-nums dark:text-slate-400"
									>≈ {formatMoney(converted, cur)}</span
								>
							{/if}
						</span>
						<button
							type="button"
							onclick={() => (openFor = openFor === e.id ? null : e.id)}
							class={[
								'px-1',
								own.length
									? 'text-blue-900 dark:text-blue-300'
									: 'text-slate-400 dark:text-slate-500'
							]}
							aria-expanded={openFor === e.id}
							aria-label="Receipts and links for {e.description}">📎{own.length || ''}</button
						>
						<form method="POST" action="?/deleteExpense" use:enhance>
							<input type="hidden" name="id" value={e.id} />
							<button
								class="px-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
								aria-label="Remove {e.description}">×</button
							>
						</form>
					</div>
					{#if openFor === e.id || attachError?.id === e.id}
						<div class="pl-9">
							<Attachments
								{tripId}
								target="expense"
								id={e.id}
								attachments={own}
								error={attachError?.id === e.id ? attachError.message : null}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-slate-500 dark:text-slate-400">
			Nothing logged yet. Amounts stay in the currency you paid in.
		</p>
	{/if}
	{#if money.ratesMissing && (mixed || bookingsMixed)}
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Couldn't reach the exchange-rate service, so conversions may be missing or out of date.
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
			placeholder="0,00"
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
		{#if sharing}
			<label class="col-span-6 flex items-center gap-2 sm:col-span-2">
				<span class="shrink-0">Paid by</span>
				<select name="paidBy" class="min-w-0 flex-1">
					{#each members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
					<option value="">Not shared</option>
				</select>
			</label>
			<fieldset class="col-span-6 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-4">
				<legend class="sr-only">Split between</legend>
				<span>Split between</span>
				{#each members as m (m.id)}
					<label class="flex items-center gap-1">
						<input type="checkbox" name="splitWith" value={m.id} checked />
						{m.name}
					</label>
				{/each}
			</fieldset>
		{/if}
		<button
			class="col-span-6 rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
		>
			Add expense
		</button>
	</form>
	{#if error}<p class="text-sm text-red-600 dark:text-red-400">{error}</p>{/if}
</section>
