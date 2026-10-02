<script lang="ts">
	import JourneyView from '#lib/components/JourneyView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><meta name="robots" content="noindex" /></svelte:head>

<JourneyView {data} editable={data.editable} backHref={data.backHref} guest />
