import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const trip = sqliteTable('trip', {
	id: id(),
	title: text('title').notNull(),
	destination: text('destination').notNull(),
	// Coordinates are resolved from the destination name when the trip is created.
	latitude: real('latitude'),
	longitude: real('longitude'),
	timezone: text('timezone'),
	startDate: text('start_date'),
	endDate: text('end_date'),
	notes: text('notes'),
	createdAt: createdAt()
});

/** One flight segment of a trip, booked or flown standby. */
export const flight = sqliteTable('flight', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	flightNumber: text('flight_number').notNull(),
	origin: text('origin').notNull(),
	destination: text('destination').notNull(),
	departureDate: text('departure_date').notNull(),
	departureTime: text('departure_time'),
	standby: integer('standby', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

/** A manually entered seat-load snapshot for a standby flight. */
export const standbyLoad = sqliteTable('standby_load', {
	id: id(),
	flightId: text('flight_id')
		.notNull()
		.references(() => flight.id, { onDelete: 'cascade' }),
	cabin: text('cabin', { enum: ['economy', 'premium', 'business', 'first'] })
		.notNull()
		.default('economy'),
	seatsAvailable: integer('seats_available').notNull(),
	standbyListed: integer('standby_listed'),
	note: text('note'),
	recordedAt: createdAt()
});

/** Read-only public link to a trip. */
export const shareLink = sqliteTable('share_link', {
	token: text('token').primaryKey(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	createdAt: createdAt(),
	revokedAt: integer('revoked_at', { mode: 'timestamp' })
});

export type Trip = typeof trip.$inferSelect;
export type Flight = typeof flight.$inferSelect;
export type StandbyLoad = typeof standbyLoad.$inferSelect;
