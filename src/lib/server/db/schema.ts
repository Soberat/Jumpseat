import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { TIMELINE_KINDS, TRANSPORT_MODES } from '../../timeline.ts';
import { EXPENSE_CATEGORIES } from '../../money.ts';

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
	// When the dates aren't fixed yet: a month ("2027-04") or a quarter ("2027-Q2").
	plannedPeriod: text('planned_period'),
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

/** Anything on a trip's timeline that isn't a flight: stays, car rentals, transfers, restaurants. */
export const timelineItem = sqliteTable('timeline_item', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: TIMELINE_KINDS }).notNull(),
	title: text('title').notNull(),
	// 'idea' for things you're considering (a restaurant someone recommended), 'booked' once confirmed.
	status: text('status', { enum: ['idea', 'booked'] })
		.notNull()
		.default('booked'),
	startDate: text('start_date'),
	startTime: text('start_time'),
	// Stays and car rentals span days: check-out / drop-off.
	endDate: text('end_date'),
	endTime: text('end_time'),
	location: text('location'),
	// Transport only.
	mode: text('mode', { enum: TRANSPORT_MODES }),
	fromPlace: text('from_place'),
	toPlace: text('to_place'),
	reference: text('reference'),
	url: text('url'),
	notes: text('notes'),
	createdAt: createdAt()
});

export type TimelineItem = typeof timelineItem.$inferSelect;

/** One line on a trip's packing list. */
export const packingItem = sqliteTable('packing_item', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	label: text('label').notNull(),
	packed: integer('packed', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

export type PackingItem = typeof packingItem.$inferSelect;

/** Money spent on a trip, in the currency it was paid in. */
export const expense = sqliteTable('expense', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	description: text('description').notNull(),
	// Minor units (cents) to avoid floating-point sums.
	amountMinor: integer('amount_minor').notNull(),
	currency: text('currency').notNull(),
	category: text('category', { enum: EXPENSE_CATEGORIES }).notNull().default('other'),
	spentOn: text('spent_on'),
	createdAt: createdAt()
});

export type Expense = typeof expense.$inferSelect;
