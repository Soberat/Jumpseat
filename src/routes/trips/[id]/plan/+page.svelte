<script lang="ts">
	import { LOCALE, formatNumber } from '#lib/format.ts';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { addDays } from '#lib/climate.ts';
	import { placeAndWhen } from '#lib/format.ts';
	import { CATEGORY_LABELS, COMMON_CURRENCIES } from '#lib/money.ts';
	import {
		BUDGET_LABELS,
		BUDGET_LEVELS,
		MAX_PLAN_DAYS,
		planParts,
		TRIP_STYLES,
		type PlanItem
	} from '#lib/plan.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const plan = $derived(data.plan);
	let startOver = $state(false);
	let submitting = $state(false);
	const showForm = $derived(
		data.enabled && (!plan || plan.status === 'failed' || (startOver && plan.status === 'ready'))
	);

	// Drafting runs on the server; check back until it's done.
	$effect(() => {
		if (plan?.status !== 'pending') return;
		const timer = setInterval(() => invalidateAll(), 3000);
		return () => clearInterval(timer);
	});

	const ICONS: Record<PlanItem['kind'], string> = {
		activity: '📍',
		restaurant: '🍽️',
		transport: '🚆',
		stay: '🏨'
	};
	const money = (n: number, currency: string) => `${formatNumber(Math.round(n))} ${currency}`;
	const dayLabel = (day: number) =>
		data.trip.startDate
			? new Date(`${addDays(data.trip.startDate, day - 1)}T12:00:00`).toLocaleDateString(LOCALE, {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				})
			: `Day ${day}`;
	const previous = $derived(plan?.request);
</script>

<svelte:head>
	<title>Plan {data.trip.title} · Jumpseat</title>
</svelte:head>

<div>
	<a href="/trips/{data.trip.id}" class="text-sm text-blue-900 hover:underline dark:text-blue-300"
		>← {data.trip.title}</a
	>
	<h1 class="mt-1 text-2xl font-bold">✨ Plan with AI</h1>
	<p class="text-slate-500 dark:text-slate-400">
		{placeAndWhen(data.trip.destination, data.trip)}
	</p>
</div>

{#if !data.enabled}
	<section class="card space-y-2 text-sm">
		<h2 class="text-lg font-semibold">Not set up yet</h2>
		<p>
			The planner uses Claude and needs an API key from
			<a
				href="https://console.anthropic.com"
				target="_blank"
				rel="noopener noreferrer"
				class="text-blue-900 underline dark:text-blue-300">console.anthropic.com</a
			>. Add it to the server's <code>.env</code> as <code>ANTHROPIC_API_KEY=…</code> and restart
			with <code>docker compose up -d</code>.
		</p>
	</section>
{/if}

{#if showForm}
	<form
		method="POST"
		action="?/generate"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
				startOver = false;
			};
		}}
		class="card space-y-5"
	>
		{#if plan?.status === 'failed'}
			<p class="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
				The last attempt didn't work: {plan.error}
			</p>
		{/if}

		<fieldset class="space-y-2">
			<legend class="font-semibold">What kind of trip?</legend>
			<div class="flex flex-wrap gap-2">
				{#each TRIP_STYLES as style (style)}
					<label class="cursor-pointer">
						<input
							type="checkbox"
							name="styles"
							value={style}
							checked={previous?.styles.includes(style) ?? false}
							class="peer sr-only"
						/>
						<span
							class="block rounded-full border border-slate-300 px-3 py-1.5 text-sm peer-checked:border-blue-900 peer-checked:bg-blue-900 peer-checked:text-white peer-focus-visible:ring-2 dark:border-slate-600 dark:peer-checked:border-blue-300 dark:peer-checked:bg-blue-300 dark:peer-checked:text-slate-900"
							>{style}</span
						>
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset class="space-y-2">
			<legend class="font-semibold">Budget</legend>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{#each BUDGET_LEVELS as level (level)}
					<label class="cursor-pointer">
						<input
							type="radio"
							name="budgetLevel"
							value={level}
							checked={(previous?.budgetLevel ?? 'moderate') === level}
							class="peer sr-only"
						/>
						<span
							class="block rounded-lg border border-slate-300 px-3 py-2 text-center text-sm peer-checked:border-blue-900 peer-checked:ring-2 peer-checked:ring-blue-900 dark:border-slate-600 dark:peer-checked:border-blue-300 dark:peer-checked:ring-blue-300"
							>{BUDGET_LABELS[level]}</span
						>
					</label>
				{/each}
			</div>
			<div class="flex gap-2 text-sm">
				<input
					name="budgetAmount"
					inputmode="numeric"
					placeholder="Total, optional (e.g. 1500)"
					value={previous?.budgetAmount ?? ''}
					aria-label="Total budget"
					class="min-w-0 flex-1"
				/>
				<input
					name="currency"
					maxlength="3"
					list="plan-currencies"
					value={previous?.currency ?? data.defaultCurrency}
					aria-label="Currency"
					class="w-20 uppercase"
				/>
				<datalist id="plan-currencies">
					{#each COMMON_CURRENCIES as c (c)}<option value={c}></option>{/each}
				</datalist>
			</div>
			<p class="text-xs text-slate-500 dark:text-slate-400">Excluding flights.</p>
		</fieldset>

		<div class="grid grid-cols-2 gap-3 text-sm">
			<label class="flex flex-col gap-1">
				Travellers
				<input name="travellers" type="number" min="1" max="20" value={previous?.travellers ?? 2} />
			</label>
			{#if data.fixedLength}
				<div class="flex flex-col gap-1">
					Length
					<span class="py-2 text-slate-500 dark:text-slate-400"
						>{data.fixedLength} days, from your dates</span
					>
				</div>
			{:else}
				<label class="flex flex-col gap-1">
					Days
					<input
						name="days"
						type="number"
						min="1"
						max={MAX_PLAN_DAYS}
						value={previous?.days ?? 4}
					/>
				</label>
			{/if}
		</div>

		<label class="flex flex-col gap-1 text-sm">
			<span class="font-semibold">Anything else?</span>
			<textarea
				name="wishes"
				rows="3"
				placeholder="We love seafood and long walks, want one lazy beach day, no museums please. Travelling with a 6-year-old."
				>{previous?.wishes ?? ''}</textarea
			>
		</label>

		{#if form?.planError}
			<p class="text-sm text-red-600 dark:text-red-400">{form.planError}</p>
		{/if}
		<div class="flex flex-wrap items-center gap-3">
			<button
				disabled={submitting}
				class="rounded-lg bg-linear-to-r from-blue-900 to-violet-700 px-5 py-2.5 font-medium text-white shadow hover:opacity-95 disabled:opacity-60"
			>
				✨ Draft my plan
			</button>
			{#if startOver}
				<button type="button" onclick={() => (startOver = false)} class="text-sm hover:underline"
					>Cancel</button
				>
			{/if}
		</div>
		<p class="text-xs text-slate-500 dark:text-slate-400">
			Drafting takes a minute or two and runs on the server, so you can leave this page. Everything
			is added as ideas you can keep or remove. Places come from Claude's knowledge, so check
			opening times before you go.
		</p>
	</form>
{/if}

{#if plan?.status === 'pending'}
	<section class="card flex items-center gap-4 p-5" aria-live="polite">
		<div
			class="size-8 shrink-0 animate-spin rounded-full border-4 border-violet-200 border-t-violet-700 dark:border-violet-900 dark:border-t-violet-300"
		></div>
		<div>
			<p class="font-semibold">Drafting your {data.trip.destination} plan…</p>
			<p class="text-sm text-slate-500 dark:text-slate-400">
				{plan.request.days} days · {plan.request.styles.join(', ') || 'any style'} · {plan.request
					.budgetLevel}. {plan.request.days > 14
					? `Long trips are drafted in ${planParts(plan.request.days).length} parts, so this takes several minutes.`
					: 'This usually takes a minute or two.'}
			</p>
		</div>
	</section>
{/if}

{#if plan?.status === 'ready' && plan.plan && !startOver}
	{@const p = plan.plan}
	{@const currency = plan.request.currency}
	<section class="card space-y-3">
		<p class="text-lg leading-relaxed">{p.summary}</p>
		<div class="flex flex-wrap gap-2 text-sm text-slate-500 dark:text-slate-400">
			<span>{plan.request.days} days</span>·<span>{plan.request.travellers} travellers</span>·<span
				>{BUDGET_LABELS[plan.request.budgetLevel]}</span
			>
			{#if plan.request.styles.length}·<span>{plan.request.styles.join(', ')}</span>{/if}
		</div>
		<div class="flex flex-wrap gap-2 pt-1">
			{#if plan.appliedAt}
				<a
					href="/trips/{data.trip.id}"
					class="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white"
					>✓ Added to your trip. View it</a
				>
			{:else}
				<form method="POST" action="?/apply" use:enhance>
					<input type="hidden" name="planId" value={plan.id} />
					<button class="rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
						>Add it all to my trip</button
					>
				</form>
			{/if}
			<button
				type="button"
				onclick={() => (startOver = true)}
				class="rounded-lg border border-blue-900 px-4 py-2 font-medium text-blue-900 dark:border-blue-300 dark:text-blue-300"
				>Draft another</button
			>
			<form method="POST" action="?/discard" use:enhance>
				<input type="hidden" name="planId" value={plan.id} />
				<button class="px-2 py-2 text-sm text-slate-500 hover:text-red-600 dark:text-slate-400"
					>Discard</button
				>
			</form>
		</div>
		{#if form?.planError}<p class="text-sm text-red-600 dark:text-red-400">{form.planError}</p>{/if}
	</section>

	<section class="card space-y-1">
		<h2 class="text-lg font-semibold">🏨 Where to stay: {p.whereToStay.area}</h2>
		<p class="text-sm">{p.whereToStay.why}</p>
		<p class="text-sm text-slate-500 dark:text-slate-400">
			Around {p.whereToStay.priceRange} a night
		</p>
	</section>

	<section class="card space-y-5">
		<h2 class="text-lg font-semibold">Day by day</h2>
		<ol class="space-y-5">
			{#each p.days as day (day.day)}
				<li>
					<h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400">
						{dayLabel(day.day)}
					</h3>
					<p class="mb-2 font-semibold">{day.theme}</p>
					<ul class="space-y-2 border-l-2 border-violet-200 pl-3 dark:border-violet-900">
						{#each day.items as item, i (i)}
							<li class="flex gap-3">
								<span class="w-11 shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400"
									>{item.time ?? ''}</span
								>
								<span class="text-lg leading-6" aria-hidden="true">{ICONS[item.kind]}</span>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-baseline gap-x-2">
										<span class="font-medium">{item.title}</span>
										{#if item.location}<span class="text-sm text-slate-500 dark:text-slate-400"
												>{item.location}</span
											>{/if}
									</div>
									<p class="text-sm">{item.details}</p>
									{#if item.estimatedCost}
										<p class="text-xs text-slate-500 dark:text-slate-400">
											≈ {money(item.estimatedCost, currency)}
										</p>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ol>
	</section>

	<div class="grid gap-4 sm:grid-cols-2">
		<section class="card space-y-2">
			<h2 class="text-lg font-semibold">Estimated budget</h2>
			<ul class="divide-y divide-slate-100 text-sm dark:divide-slate-700">
				{#each p.budget.lines as line, i (i)}
					<li class="flex justify-between gap-3 py-1.5">
						<span>
							{CATEGORY_LABELS[line.category]}
							{#if line.note}<span class="block text-xs text-slate-500 dark:text-slate-400"
									>{line.note}</span
								>{/if}
						</span>
						<span class="tabular-nums">{money(line.amount, currency)}</span>
					</li>
				{/each}
				<li class="flex justify-between py-1.5 font-semibold">
					<span>Total</span><span class="tabular-nums">{money(p.budget.total, currency)}</span>
				</li>
			</ul>
			{#if plan.request.budgetAmount}
				<p
					class={[
						'text-sm',
						p.budget.total > plan.request.budgetAmount
							? 'text-amber-700 dark:text-amber-300'
							: 'text-emerald-700 dark:text-emerald-300'
					]}
				>
					{p.budget.total > plan.request.budgetAmount
						? `About ${money(p.budget.total - plan.request.budgetAmount, currency)} over your ${money(plan.request.budgetAmount, currency)}`
						: `Within your ${money(plan.request.budgetAmount, currency)}`}
				</p>
			{/if}
		</section>

		<section class="card space-y-2">
			<h2 class="text-lg font-semibold">Local tips</h2>
			<ul class="list-disc space-y-1 pl-5 text-sm">
				{#each p.tips as tip, i (i)}<li>{tip}</li>{/each}
			</ul>
			{#if p.packing.length}
				<h3 class="pt-2 font-semibold">Pack</h3>
				<p class="text-sm">{p.packing.join(' · ')}</p>
			{/if}
		</section>
	</div>
{/if}
