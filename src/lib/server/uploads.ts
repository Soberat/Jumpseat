import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { DATABASE_URL } from '$app/env/private';
import { db } from './db/index.ts';
import { attachment } from './db/schema.ts';

/** Photos live next to the database (the /data volume in Docker), one folder per trip. */
export const uploadsDir = (tripId: string) =>
	join(dirname(DATABASE_URL), 'uploads', tripId.replace(/[^a-z0-9-]/gi, ''));

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

const TYPES: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/heic': 'heic',
	'image/heif': 'heif'
};
export const PHOTO_TYPES = Object.keys(TYPES);

export const contentTypeOf = (file: string) =>
	Object.entries(TYPES).find(([, ext]) => file.endsWith(`.${ext}`))?.[0] ??
	'application/octet-stream';

/** Saves an uploaded photo and returns its file name. */
export async function savePhoto(tripId: string, file: File): Promise<string> {
	const ext = TYPES[file.type];
	if (!ext) throw new Error('Photos must be JPEG, PNG, WebP, GIF or HEIC.');
	if (file.size > MAX_PHOTO_BYTES) throw new Error('That photo is over 12 MB.');
	const name = `${crypto.randomUUID()}.${ext}`;
	const path = join(uploadsDir(tripId), name);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, Buffer.from(await file.arrayBuffer()));
	return name;
}

/** Removes photo files nothing points at any more (after deleting an entry, say). */
export async function pruneUploads(tripId: string): Promise<void> {
	const dir = uploadsDir(tripId);
	const files = await readdir(dir).catch(() => [] as string[]);
	if (files.length === 0) return;
	const rows = await db
		.select({ url: attachment.url })
		.from(attachment)
		.where(eq(attachment.tripId, tripId));
	const kept = new Set(rows.map((r) => r.url));
	await Promise.all(
		files.filter((f) => !kept.has(f)).map((f) => rm(join(dir, f), { force: true }))
	);
}

/** A deleted trip takes its photos with it. */
export async function removeTripUploads(tripId: string): Promise<void> {
	await rm(uploadsDir(tripId), { recursive: true, force: true });
}
