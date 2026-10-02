import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { TIMELINE_KINDS, TRANSPORT_MODES } from '../../timeline.ts';
import { EXPENSE_CATEGORIES } from '../../money.ts';
import { PAYMENT_STATUSES } from '../../cost.ts';

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
	// Airport code the trip starts from; null means the default home airport.
	origin: text('origin'),
	// Places the trip goes on to after the destination, in order: JSON TripStop[].
	stops: text('stops'),
	// What shared costs are added up and settled in.
	settleCurrency: text('settle_currency').notNull().default('PLN'),
	notes: text('notes'),
	createdAt: createdAt()
});

/** What a booking costs and whether it's paid yet; see #lib/cost.ts. */
const costColumns = () => ({
	costMinor: integer('cost_minor'),
	costCurrency: text('cost_currency'),
	paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }),
	// When it has to be paid, for 'due'.
	dueDate: text('due_date')
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
	// From a schedule lookup; local to the arrival airport.
	arrivalDate: text('arrival_date'),
	arrivalTime: text('arrival_time'),
	durationMinutes: integer('duration_minutes'),
	standby: integer('standby', { mode: 'boolean' }).notNull().default(false),
	...costColumns(),
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

/** Public link to a trip: read-only, or letting whoever has it plan along. */
export const shareLink = sqliteTable('share_link', {
	token: text('token').primaryKey(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	canEdit: integer('can_edit', { mode: 'boolean' }).notNull().default(false),
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
	// "Day 3 of the trip", for AI-plan ideas on trips whose dates aren't fixed yet.
	// A real startDate wins; otherwise it's placed relative to the trip's start.
	day: integer('day'),
	// How long it takes, for things that happen within a day (a tour, dinner).
	durationMinutes: integer('duration_minutes'),
	...costColumns(),
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

/** Someone on the trip, for splitting costs. */
export const tripMember = sqliteTable('trip_member', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	createdAt: createdAt()
});

export type TripMember = typeof tripMember.$inferSelect;

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
	// Who paid, and who it's split between (JSON member ids, equal shares). Both empty on
	// trips nobody shares.
	paidBy: text('paid_by').references(() => tripMember.id, { onDelete: 'set null' }),
	splitWith: text('split_with'),
	// Money handed over to settle up, not something bought: left out of the totals.
	transfer: integer('transfer', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

export type Expense = typeof expense.$inferSelect;

/** An AI-drafted plan for a trip. Generated in the background, so it has a status. */
export const tripPlan = sqliteTable('trip_plan', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	status: text('status', { enum: ['pending', 'ready', 'failed'] })
		.notNull()
		.default('pending'),
	// JSON: PlanRequest (what was asked) and TripPlan (the answer).
	request: text('request').notNull(),
	plan: text('plan'),
	error: text('error'),
	appliedAt: integer('applied_at', { mode: 'timestamp' }),
	createdAt: createdAt()
});

export type TripPlanRow = typeof tripPlan.$inferSelect;

/** Daily reference rates (ECB, via Frankfurter), cached so conversions work offline. */
export const exchangeRate = sqliteTable('exchange_rate', {
	// The day the rates are for, YYYY-MM-DD.
	date: text('date').primaryKey(),
	// JSON: units of each currency per 1 EUR.
	rates: text('rates').notNull(),
	fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull()
});

/** A link or photo attached to one thing on a trip: an entry, a flight or an expense. */
export const attachment = sqliteTable('attachment', {
	id: id(),
	tripId: text('trip_id')
		.notNull()
		.references(() => trip.id, { onDelete: 'cascade' }),
	itemId: text('item_id').references(() => timelineItem.id, { onDelete: 'cascade' }),
	flightId: text('flight_id').references(() => flight.id, { onDelete: 'cascade' }),
	expenseId: text('expense_id').references(() => expense.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: ['link', 'photo'] }).notNull(),
	label: text('label'),
	// Links: the address. Photos: the file name in the uploads folder.
	url: text('url').notNull(),
	createdAt: createdAt()
});

export type Attachment = typeof attachment.$inferSelect;
