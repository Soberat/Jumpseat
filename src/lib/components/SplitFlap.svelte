<script lang="ts">
	import { onMount, untrack } from 'svelte';

	/** Departure-board text: each character flips through the alphabet before settling. */
	let {
		text,
		size = 'md',
		delay = 0
	}: { text: string; size?: 'sm' | 'md' | 'lg'; delay?: number } = $props();

	const CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let shown = $state(untrack(() => text.split('')));
	let flipping = $state<boolean[]>([]);

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const target = text.split('');
		shown = target.map(() => ' ');
		const timers: ReturnType<typeof setTimeout>[] = [];
		target.forEach((ch, i) => {
			// Later characters settle later, like a real board.
			const flips = 6 + i * 2;
			for (let f = 0; f <= flips; f++) {
				timers.push(
					setTimeout(
						() => {
							shown[i] = f === flips ? ch : CHARS[Math.floor(Math.random() * CHARS.length)];
							flipping[i] = f !== flips;
						},
						delay + f * 55
					)
				);
			}
		});
		return () => timers.forEach(clearTimeout);
	});

	const sizes = {
		sm: 'h-6 w-4 text-sm',
		md: 'h-9 w-6 text-xl',
		lg: 'h-14 w-10 text-4xl'
	};
</script>

<span class="inline-flex gap-[3px]" aria-label={text} role="img">
	{#each shown as ch, i (i)}
		<span
			aria-hidden="true"
			class={[
				'relative inline-flex items-center justify-center overflow-hidden rounded-[3px] bg-ink-950 font-mono font-bold text-runway shadow-[inset_0_-1px_0_rgb(255_255_255/0.06)]',
				sizes[size],
				flipping[i] && 'text-amber-200'
			]}
		>
			{ch === ' ' ? ' ' : ch}
			<!-- The hinge line across the middle of each flap. -->
			<span class="absolute inset-x-0 top-1/2 h-px bg-black/60"></span>
		</span>
	{/each}
</span>
