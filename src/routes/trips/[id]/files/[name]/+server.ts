import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { attachment } from '#lib/server/db/schema.ts';
import { contentTypeOf, uploadsDir } from '#lib/server/uploads.ts';
import type { RequestHandler } from './$types';

/** A photo attached to something on the trip. Names are random, so they never change. */
export const GET: RequestHandler = async ({ params }) => {
	const [found] = await db
		.select({ url: attachment.url })
		.from(attachment)
		.where(
			and(
				eq(attachment.tripId, params.id),
				eq(attachment.url, params.name),
				eq(attachment.kind, 'photo')
			)
		);
	if (!found) error(404, 'Not found');
	const body = await readFile(join(uploadsDir(params.id), found.url)).catch(() => null);
	if (!body) error(404, 'Not found');
	return new Response(body, {
		headers: {
			'content-type': contentTypeOf(found.url),
			'cache-control': 'private, max-age=31536000, immutable'
		}
	});
};
