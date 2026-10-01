<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<header class="bg-blue-900 text-white">
	<div class="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
		<img src="/favicon.svg" alt="" class="h-7 w-7" />
		<a href="/" class="text-lg font-semibold tracking-tight">Jumpseat</a>
	</div>
</header>

<main class="mx-auto max-w-3xl space-y-6 px-4 py-6">
	{@render children()}
</main>
