<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>Sign in · Jumpseat</title>
</svelte:head>

<section class="card mx-auto mt-6 max-w-sm space-y-4">
	<div class="text-center">
		<span class="text-4xl" aria-hidden="true">🔐</span>
		<h1 class="mt-1 text-xl font-semibold">Jumpseat is private</h1>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
			Enter the password you were given to look around.
		</p>
	</div>
	<form method="POST" class="space-y-3">
		<input type="hidden" name="next" value={data.next} />
		<input
			name="password"
			type="password"
			required
			autocomplete="current-password"
			aria-label="Password"
			placeholder="Password"
			class="w-full"
		/>
		{#if form?.error}<p class="text-sm text-red-600 dark:text-red-400">{form.error}</p>{/if}
		<button class="w-full rounded-lg bg-blue-900 px-4 py-2 font-medium text-white hover:bg-blue-800"
			>Sign in</button
		>
	</form>
</section>
