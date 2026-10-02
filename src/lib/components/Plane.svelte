<script lang="ts">
	/** A small plane silhouette pointing right; inherits the text colour. */
	let { class: className = '' }: { class?: string } = $props();
</script>

<svg
	viewBox="-14 -12 28 24"
	class={['inline-block h-[1em] w-[1.2em]', className]}
	aria-hidden="true"
>
	<path
		d="M13 0 5-2.2-1-11h-3.4L-.4-2.2H-8l-2.6-3.6h-2.2L-11.4 0l-1.4 5.8h2.2L-8 2.2h7.6L-4.4 11H-1L5 2.2Z"
		fill="currentColor"
	/>
</svg>
