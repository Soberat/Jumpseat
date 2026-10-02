import { randomBytes } from 'node:crypto';
import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { PUBLIC_ORIGIN } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import {
	attachment,
	expense,
	flight,
	packingItem,
	shareLink,
	standbyLoad,
	timelineItem,
	trip
} from '#lib/server/db/schema.ts';
import { EXPENSE_CATEGORIES, parseAmount, type ExpenseCategory } from '#lib/money.ts';
import { geocode, getTripWeather } from '#lib/server/open-meteo.ts';
import { getNearbySights } from '#lib/server/wikipedia.ts';
import { parseWhen, whenWindow } from '#lib/when.ts';
import {
	field,
	getLoadsForFlights,
	getTripPlan,
	optionalField,
	resolveStops
} from '#lib/server/trips.ts';
import { parseOrigin, readStops, tripRoute } from '#lib/trip-route.ts';
import { buildGantt } from '#lib/gantt.ts';
import { scheduleTrip } from '#lib/schedule.ts';
import { parseDuration } from '#lib/duration.ts';
import { flightLookupEnabled } from '#lib/server/flight-lookup.ts';
import { NO_COST, parseCost, summariseCosts } from '#lib/cost.ts';
import {
	attachmentActions,
	loadMoney,
	moneyActions,
	readSplit
} from '#lib/server/sharing-costs.ts';
import { pruneUploads, removeTripUploads } from '#lib/server/uploads.ts';
import {
	buildTimeline,
	TIMELINE_KINDS,
	TRANSPORT_MODES,
	transportTitle,
	type TimelineKind,
	type TransportMode
} from '#lib/timeline.ts';
import type { Actions, PageServerLoad } from './$types';

const CABINS = ['economy', 'premium', 'business', 'first'] as const;

export const load: PageServerLoad = async ({ params, url }) => {
	const found = await getTripPlan(params.id);
	if (!found) error(404, 'Trip not found');

	// The lookup may have failed when the trip was created (offline, typo); retry it.
	if (found.trip.latitude === null) {
		const place = await geocode(found.trip.destination).catch(() => null);
		if (place) {
			const coords = {
				latitude: place.latitude,
				longitude: place.longitude,
				timezone: place.timezone
			};
			await db.update(trip).set(coords).where(eq(trip.id, params.id));
			Object.assign(found.trip, coords);
		}
	}

	const [loads, shares, weather, packing, expenses, attachments] = await Promise.all([
		getLoadsForFlights(found.flights.map((f) => f.id)),
		db
			.select()
			.from(shareLink)
			.where(and(eq(shareLink.tripId, params.id), isNull(shareLink.revokedAt)))
			.orderBy(desc(shareLink.createdAt)),
		found.trip.latitude !== null && found.trip.longitude !== null
			? getTripWeather(found.trip.latitude, found.trip.longitude, whenWindow(found.trip))
			: Promise.resolve(null),
		db
			.select()
			.from(packingItem)
			.where(eq(packingItem.tripId, params.id))
			.orderBy(asc(packingItem.createdAt), asc(packingItem.label)),
		db
			.select()
			.from(expense)
			.where(eq(expense.tripId, params.id))
			.orderBy(desc(expense.spentOn), desc(expense.createdAt)),
		db
			.select()
			.from(attachment)
			.where(eq(attachment.tripId, params.id))
			.orderBy(asc(attachment.createdAt))
	]);
	const money = await loadMoney(params.id, found.trip.settleCurrency, expenses, [
		...found.flights,
		...found.items.filter((i) => i.status === 'booked')
	]);

	const origin = PUBLIC_ORIGIN ?? url.origin;
	const schedule = scheduleTrip(found.trip, found.flights, found.items);
	const { latitude, longitude } = found.trip;
	return {
		// Streamed: the page renders first and the suggestions fill in.
		sights:
			latitude !== null && longitude !== null
				? getNearbySights(latitude, longitude)
				: Promise.resolve([]),
		trip: found.trip,
		timeline: buildTimeline(found.flights, schedule.items),
		gantt: buildGantt(found.flights, schedule.items, { ...found.trip, startDate: schedule.start }),
		schedule: { start: schedule.start, undated: schedule.undated },
		loads,
		weather,
		route: tripRoute(found.trip, found.flights),
		packing,
		expenses,
		money,
		attachments,
		today: new Date().toISOString().slice(0, 10),
		shares: shares.map((s) => ({
			token: s.token,
			canEdit: s.canEdit,
			url: `${origin}/s/${s.token}`
		})),
		flightLookup: flightLookupEnabled(),
		bookings: summariseCosts(
			[
				...found.flights.map((f) => ({
					...f,
					label: `${f.flightNumber} ${f.origin}→${f.destination}`
				})),
				...found.items.filter((i) => i.status === 'booked').map((i) => ({ ...i, label: i.title }))
			],
			new Date().toISOString().slice(0, 10)
		),
		// Most bookings on a trip are in one currency: offer the last one used.
		lastCurrency:
			[...found.flights, ...found.items]
				.filter((x) => x.costCurrency)
				.sort((a, b) => +b.createdAt - +a.createdAt)[0]?.costCurrency ?? undefined
	};
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const data = await request.formData();
		const title = field(data, 'title');
		const destination = field(data, 'destination');
		if (!title || !destination) {
			return fail(400, { tripError: 'A trip needs a name and a destination.' });
		}
		const when = parseWhen(data);
		if ('error' in when) return fail(400, { tripError: when.error });
		const origin = parseOrigin(field(data, 'origin'));
		if ('error' in origin) return fail(400, { tripError: origin.error });

		const [current] = await db.select().from(trip).where(eq(trip.id, params.id));
		if (!current) error(404, 'Trip not found');

		// A new destination needs new coordinates; if the lookup fails, the page retries later.
		let coords = {};
		if (destination !== current.destination) {
			const place = await geocode(destination).catch(() => null);
			coords = {
				latitude: place?.latitude ?? null,
				longitude: place?.longitude ?? null,
				timezone: place?.timezone ?? null
			};
		}
		const stops = await resolveStops(data, readStops(current.stops));
		await db
			.update(trip)
			.set({ title, destination, stops, ...origin, ...when, ...coords })
			.where(eq(trip.id, params.id));
		return { tripSaved: true };
	},

	addFlight: async ({ params, request }) => {
		const data = await request.formData();
		const flightNumber = field(data, 'flightNumber').toUpperCase().replace(/\s+/g, '');
		const origin = field(data, 'origin').toUpperCase();
		const destination = field(data, 'destination').toUpperCase();
		const departureDate = field(data, 'departureDate');
		if (!flightNumber || !origin || !destination || !departureDate) {
			return fail(400, { flightError: 'Flight number, route and date are required.' });
		}
		const cost = parseCost(data);
		if ('error' in cost) return fail(400, { flightError: cost.error });
		await db.insert(flight).values({
			...cost,
			tripId: params.id,
			flightNumber,
			origin,
			destination,
			departureDate,
			departureTime: optionalField(data, 'departureTime'),
			arrivalDate: optionalField(data, 'arrivalDate'),
			arrivalTime: optionalField(data, 'arrivalTime'),
			durationMinutes: parseDuration(field(data, 'durationMinutes')),
			standby: data.get('standby') === 'on'
		});
	},

	addItem: async ({ params, request }) => {
		const data = await request.formData();
		const kind = field(data, 'kind') as TimelineKind;
		if (!TIMELINE_KINDS.includes(kind)) return fail(400, { itemError: 'Pick what to add.' });

		const modeRaw = field(data, 'mode') as TransportMode;
		const mode = kind === 'transport' && TRANSPORT_MODES.includes(modeRaw) ? modeRaw : null;
		const fromPlace = kind === 'transport' ? optionalField(data, 'fromPlace') : null;
		const toPlace = kind === 'transport' ? optionalField(data, 'toPlace') : null;
		const title =
			field(data, 'title') ||
			(kind === 'transport' ? transportTitle(mode, fromPlace, toPlace) : '');
		if (!title) return fail(400, { itemError: 'Give it a name.' });

		const startDate = optionalField(data, 'startDate');
		const spans = kind === 'stay' || kind === 'car';
		const endDate = spans ? optionalField(data, 'endDate') : null;
		if (endDate && (!startDate || endDate < startDate)) {
			return fail(400, { itemError: 'The end date must be on or after the start date.' });
		}

		const url = optionalField(data, 'url');
		if (url && !/^https?:\/\//i.test(url)) {
			return fail(400, { itemError: 'Links must start with http:// or https://.' });
		}
		const cost = parseCost(data);
		if ('error' in cost) return fail(400, { itemError: cost.error });

		await db.insert(timelineItem).values({
			...cost,
			tripId: params.id,
			kind,
			title,
			status: data.get('status') === 'idea' ? 'idea' : 'booked',
			startDate,
			startTime: startDate ? optionalField(data, 'startTime') : null,
			durationMinutes: spans ? null : parseDuration(field(data, 'duration')),
			endDate,
			endTime: endDate ? optionalField(data, 'endTime') : null,
			location: kind === 'transport' ? null : optionalField(data, 'location'),
			mode,
			fromPlace,
			toPlace,
			reference: optionalField(data, 'reference'),
			url,
			notes: optionalField(data, 'notes')
		});
	},

	deleteItem: async ({ params, request }) => {
		const id = field(await request.formData(), 'itemId');
		await db
			.delete(timelineItem)
			.where(and(eq(timelineItem.id, id), eq(timelineItem.tripId, params.id)));
		await pruneUploads(params.id);
	},

	deleteFlight: async ({ params, request }) => {
		const id = field(await request.formData(), 'flightId');
		await db.delete(flight).where(and(eq(flight.id, id), eq(flight.tripId, params.id)));
		await pruneUploads(params.id);
	},

	setCost: async ({ params, request }) => {
		const data = await request.formData();
		const id = field(data, 'id');
		const cost = data.get('clear') ? NO_COST : parseCost(data);
		if ('error' in cost) return fail(400, { costError: cost.error, costFor: id });
		await saveCost(params.id, field(data, 'target'), id, cost);
	},

	markPaid: async ({ params, request }) => {
		const data = await request.formData();
		await saveCost(params.id, field(data, 'target'), field(data, 'id'), {
			paymentStatus: 'paid',
			dueDate: null
		});
	},

	logLoad: async ({ params, request }) => {
		const data = await request.formData();
		const flightId = field(data, 'flightId');
		const seatsAvailable = Number(field(data, 'seatsAvailable'));
		const listedRaw = field(data, 'standbyListed');
		const standbyListed = listedRaw === '' ? null : Number(listedRaw);
		const cabin = field(data, 'cabin') as (typeof CABINS)[number];

		const isCount = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0);
		if (!isCount(seatsAvailable) || !isCount(standbyListed) || !CABINS.includes(cabin)) {
			return fail(400, { loadError: 'Seat counts must be whole numbers.', flightId });
		}
		const [owner] = await db
			.select({ id: flight.id })
			.from(flight)
			.where(and(eq(flight.id, flightId), eq(flight.tripId, params.id)));
		if (!owner) error(404, 'Flight not found');

		await db.insert(standbyLoad).values({
			flightId,
			cabin,
			seatsAvailable,
			standbyListed,
			note: optionalField(data, 'note')
		});
	},

	addPacking: async ({ params, request }) => {
		const data = await request.formData();
		const wanted = data
			.getAll('label')
			.map((l) => String(l).trim())
			.filter(Boolean);
		if (wanted.length === 0) return fail(400, { packingError: 'Type what to pack.' });

		// Adding a preset twice shouldn't duplicate lines already on the list.
		const existing = await db
			.select({ label: packingItem.label })
			.from(packingItem)
			.where(eq(packingItem.tripId, params.id));
		const seen = new Set(existing.map((e) => e.label.toLowerCase()));
		const fresh = wanted.filter((l) => {
			const key = l.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		if (fresh.length > 0) {
			await db.insert(packingItem).values(fresh.map((label) => ({ tripId: params.id, label })));
		}
	},

	togglePacking: async ({ params, request }) => {
		const data = await request.formData();
		await db
			.update(packingItem)
			.set({ packed: data.get('packed') === 'true' })
			.where(and(eq(packingItem.id, field(data, 'id')), eq(packingItem.tripId, params.id)));
	},

	deletePacking: async ({ params, request }) => {
		const id = field(await request.formData(), 'id');
		await db
			.delete(packingItem)
			.where(and(eq(packingItem.id, id), eq(packingItem.tripId, params.id)));
	},

	addExpense: async ({ params, request }) => {
		const data = await request.formData();
		const description = field(data, 'description');
		const currency = field(data, 'currency').toUpperCase();
		const category = field(data, 'category') as ExpenseCategory;
		if (!description) return fail(400, { expenseError: 'Say what it was for.' });
		if (!/^[A-Z]{3}$/.test(currency)) {
			return fail(400, { expenseError: 'Use a three-letter currency code, like EUR.' });
		}
		const amountMinor = parseAmount(field(data, 'amount'), currency);
		if (amountMinor === null) return fail(400, { expenseError: 'Enter an amount, like 12.50.' });
		const split = await readSplit(params.id, data);
		if ('error' in split) return fail(400, { expenseError: split.error });

		await db.insert(expense).values({
			tripId: params.id,
			description,
			amountMinor,
			currency,
			category: EXPENSE_CATEGORIES.includes(category) ? category : 'other',
			spentOn: optionalField(data, 'spentOn'),
			...split
		});
		return { expenseCurrency: currency };
	},

	deleteExpense: async ({ params, request }) => {
		const id = field(await request.formData(), 'id');
		await db.delete(expense).where(and(eq(expense.id, id), eq(expense.tripId, params.id)));
		await pruneUploads(params.id);
	},

	addMember: ({ params, request }) => moneyActions.addMember(params.id, request),
	removeMember: ({ params, request }) => moneyActions.removeMember(params.id, request),
	setSettleCurrency: ({ params, request }) => moneyActions.setSettleCurrency(params.id, request),
	settleTransfer: ({ params, request }) => moneyActions.settleTransfer(params.id, request),
	addAttachment: ({ params, request }) => attachmentActions.addAttachment(params.id, request),
	deleteAttachment: ({ params, request }) => attachmentActions.deleteAttachment(params.id, request),

	share: async ({ params, request }) => {
		const canEdit = (await request.formData()).get('canEdit') === 'on';
		await db
			.insert(shareLink)
			.values({ token: randomBytes(18).toString('base64url'), tripId: params.id, canEdit });
	},

	revokeShare: async ({ params, request }) => {
		const token = field(await request.formData(), 'token');
		await db
			.update(shareLink)
			.set({ revokedAt: new Date() })
			.where(and(eq(shareLink.token, token), eq(shareLink.tripId, params.id)));
	},

	delete: async ({ params }) => {
		await db.delete(trip).where(eq(trip.id, params.id));
		await removeTripUploads(params.id);
		redirect(303, '/');
	}
};

async function saveCost(
	tripId: string,
	target: string,
	id: string,
	cost: Partial<typeof NO_COST>
): Promise<void> {
	if (target === 'flight') {
		await db
			.update(flight)
			.set(cost)
			.where(and(eq(flight.id, id), eq(flight.tripId, tripId)));
	} else {
		await db
			.update(timelineItem)
			.set(cost)
			.where(and(eq(timelineItem.id, id), eq(timelineItem.tripId, tripId)));
	}
}
