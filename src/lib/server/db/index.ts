import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';

function open() {
	const path = building ? ':memory:' : DATABASE_URL;
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const client = new Database(path);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	const db = drizzle(client, { schema });
	// Apply pending migrations from ./drizzle on startup so a fresh container just works.
	if (!building) migrate(db, { migrationsFolder: 'drizzle' });
	return db;
}

export const db = open();
