<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { Attachment } from '#lib/server/db/schema.ts';

	let {
		tripId,
		target,
		id,
		attachments,
		error = null
	}: {
		tripId: string;
		target: 'item' | 'flight' | 'expense';
		id: string;
		/** Only this thing's attachments. */
		attachments: Attachment[];
		error?: string | null;
	} = $props();

	const photos = $derived(attachments.filter((a) => a.kind === 'photo'));
	const links = $derived(attachments.filter((a) => a.kind === 'link'));
	const host = (url: string) => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	};
	let busy = $state(false);

	// Phone photos are several megabytes; a 2000px JPEG is plenty to look at later.
	const MAX_SIDE = 2000;
	async function shrink(file: File): Promise<Blob | File> {
		if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
			if (scale === 1 && file.size < 1_500_000) return file;
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
			return blob && blob.size < file.size ? blob : file;
		} catch {
			return file;
		}
	}

	const upload: SubmitFunction = async ({ formData }) => {
		busy = true;
		const file = formData.get('photo');
		if (file instanceof File && file.size > 0) {
			const small = await shrink(file);
			if (small !== file) formData.set('photo', small, file.name.replace(/\.\w+$/, '') + '.jpg');
		}
		return async ({ update }) => {
			await update();
			busy = false;
		};
	};
</script>

<div class="mt-2 space-y-2 text-sm">
	{#if photos.length}
		<ul class="flex flex-wrap gap-2">
			{#each photos as p (p.id)}
				<li class="group relative">
					<a href="/trips/{tripId}/files/{p.url}" target="_blank" rel="noopener">
						<img
							src="/trips/{tripId}/files/{p.url}"
							alt={p.label ?? 'Photo'}
							loading="lazy"
							class="size-20 rounded-lg object-cover shadow-sm"
						/>
					</a>
					<form
						method="POST"
						action="?/deleteAttachment"
						use:enhance
						class="absolute -top-1.5 -right-1.5"
					>
						<input type="hidden" name="id" value={p.id} />
						<button
							class="flex size-6 items-center justify-center rounded-full bg-slate-900/70 text-xs text-white hover:bg-red-600"
							aria-label="Remove photo">×</button
						>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
	{#if links.length}
		<ul class="space-y-1">
			{#each links as l (l.id)}
				<li class="flex items-center gap-2">
					<span aria-hidden="true">🔗</span>
					<a
						href={l.url}
						target="_blank"
						rel="noopener noreferrer"
						class="min-w-0 truncate text-blue-900 hover:underline dark:text-blue-300"
						>{l.label ?? host(l.url)}</a
					>
					{#if l.label}<span class="truncate text-xs text-slate-500 dark:text-slate-400"
							>{host(l.url)}</span
						>{/if}
					<form method="POST" action="?/deleteAttachment" use:enhance class="ml-auto">
						<input type="hidden" name="id" value={l.id} />
						<button
							class="min-h-8 min-w-8 px-1 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
							aria-label="Remove link">×</button
						>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
	<details open={!!error}>
		<summary class="cursor-pointer text-xs text-slate-500 select-none dark:text-slate-400"
			>📎 Add a link or photo</summary
		>
		<div class="mt-2 space-y-2">
			<form method="POST" action="?/addAttachment" use:enhance class="flex flex-wrap gap-2">
				<input type="hidden" name="target" value={target} />
				<input type="hidden" name="id" value={id} />
				<input
					name="url"
					type="url"
					required
					placeholder="https://"
					aria-label="Link"
					class="min-w-0 flex-[2_1_10rem]"
				/>
				<input
					name="label"
					placeholder="Name (optional)"
					aria-label="Link name"
					class="min-w-0 flex-[1_1_7rem]"
				/>
				<button class="rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600"
					>Add link</button
				>
			</form>
			<form
				method="POST"
				action="?/addAttachment"
				enctype="multipart/form-data"
				use:enhance={upload}
				class="flex items-center gap-2"
			>
				<input type="hidden" name="target" value={target} />
				<input type="hidden" name="id" value={id} />
				<label
					class={[
						'cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 dark:border-slate-600',
						busy && 'opacity-60'
					]}
				>
					{busy ? 'Uploading…' : '📷 Add a photo'}
					<input
						type="file"
						name="photo"
						accept="image/*"
						class="sr-only"
						disabled={busy}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
				</label>
			</form>
			{#if error}<p class="text-red-600 dark:text-red-400">{error}</p>{/if}
		</div>
	</details>
</div>
