<script lang="ts">
	import './layout.css';
	import { onNavigate } from '$app/navigation';

	let { children } = $props();

	// Cross-fade between pages and morph shared elements (route codes, titles).
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<header class="relative overflow-hidden bg-ink-900 text-white">
	<div
		class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(246_178_60/0.18),transparent_60%)]"
	></div>
	<div class="relative mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-3">
		<img src="/favicon.svg" alt="" class="h-7 w-7" />
		<a href="/" class="font-display text-lg font-bold tracking-[0.18em] uppercase">Jumpseat</a>
		<!-- A contrail drifting across the header. -->
		<svg
			class="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-64 sm:block"
			viewBox="0 0 256 52"
			aria-hidden="true"
		>
			<path
				d="M0 40 Q120 36 236 14"
				fill="none"
				stroke="white"
				stroke-opacity="0.35"
				stroke-dasharray="2 6"
				stroke-linecap="round"
			/>
			<text x="230" y="17" font-size="14" class="fill-runway">✈</text>
		</svg>
	</div>
</header>

<main class="mx-auto max-w-3xl space-y-6 px-4 py-6">
	{@render children()}
</main>
