import { error, fail, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { expense, packingItem, timelineItem, tripPlan } from '#lib/server/db/schema.ts';
import { expireStalePlans, generatePlan, plannerEnabled } from '#lib/server/planner.ts';
import { field, getTripPlan } from '#lib/server/trips.ts';
import {
	BUDGET_LEVELS,
	planLength,
	PlanRequestSchema,
	planToTimeline,
	TripPlanSchema,
	type BudgetLevel,
	type PlanRequest
} from '#lib/plan.ts';
import { whenWindow } from '#lib/when.ts';
import type { Actions, PageServerLoad } from './$types';

async function latestPlan(tripId: string) {
	const [row] = await db
		.select()
		.from(tripPlan)
		.where(eq(tripPlan.tripId, tripId))
		.orderBy(desc(tripPlan.createdAt))
		.limit(1);
	return row ?? null;
}

export const load: PageServerLoad = async ({ params }) => {
	const found = await getTripPlan(params.id);
	if (!found) error(404, 'Trip not found');
	await expireStalePlans(params.id);

	const row = await latestPlan(params.id);
	const [lastExpense] = await db
		.select({ currency: expense.currency })
		.from(expense)
		.where(eq(expense.tripId, params.id))
		.orderBy(desc(expense.createdAt))
		.limit(1);

	const window = whenWindow(found.trip);
	return {
		trip: found.trip,
		enabled: plannerEnabled(),
		fixedLength: window.type === 'exact' ? planLength(window, 1) : null,
		defaultCurrency: lastExpense?.currency ?? 'EUR',
		plan: row && {
			id: row.id,
			status: row.status,
			error: row.error,
			appliedAt: row.appliedAt,
			createdAt: row.createdAt,
			request: PlanRequestSchema.parse(JSON.parse(row.request)),
			plan: row.plan ? TripPlanSchema.parse(JSON.parse(row.plan)) : null
		}
	};
};

export const actions: Actions = {
	generate: async ({ params, request }) => {
		if (!plannerEnabled()) return fail(400, { planError: 'The planner is not set up.' });
		const found = await getTripPlan(params.id);
		if (!found) error(404, 'Trip not found');

		const data = await request.formData();
		const currency = field(data, 'currency').toUpperCase() || 'EUR';
		if (!/^[A-Z]{3}$/.test(currency)) {
			return fail(400, { planError: 'Use a three-letter currency code, like EUR.' });
		}
		const budgetRaw = field(data, 'budgetAmount');
		const budgetAmount = budgetRaw ? Math.round(Number(budgetRaw.replace(/[\s,]/g, ''))) : null;
		if (budgetAmount !== null && !(budgetAmount > 0)) {
			return fail(400, { planError: 'The budget should be a whole number, like 1500.' });
		}
		const level = field(data, 'budgetLevel') as BudgetLevel;
		const travellers = Math.min(Math.max(Number(field(data, 'travellers')) || 1, 1), 20);

		const planRequest: PlanRequest = {
			styles: data.getAll('styles').map(String).filter(Boolean).slice(0, 10),
			budgetLevel: BUDGET_LEVELS.includes(level) ? level : 'moderate',
			budgetAmount,
			currency,
			travellers,
			days: planLength(whenWindow(found.trip), Number(field(data, 'days')) || 4),
			wishes: field(data, 'wishes').slice(0, 1500)
		};

		const [row] = await db
			.insert(tripPlan)
			.values({ tripId: params.id, request: JSON.stringify(planRequest) })
			.returning({ id: tripPlan.id });
		// Runs in the background; the page polls until the row is ready.
		void generatePlan(row.id, found.trip, planRequest, found.flights, found.items);
	},

	apply: async ({ params, request }) => {
		const id = field(await request.formData(), 'planId');
		const [row] = await db
			.select()
			.from(tripPlan)
			.where(and(eq(tripPlan.id, id), eq(tripPlan.tripId, params.id)));
		if (!row?.plan || row.appliedAt) return fail(400, { planError: 'Nothing to add.' });
		const found = await getTripPlan(params.id);
		if (!found) error(404, 'Trip not found');

		const plan = TripPlanSchema.parse(JSON.parse(row.plan));
		const req = PlanRequestSchema.parse(JSON.parse(row.request));
		const rows = planToTimeline(plan, found.trip.startDate, req.currency);

		const existing = await db
			.select({ label: packingItem.label })
			.from(packingItem)
			.where(eq(packingItem.tripId, params.id));
		const seen = new Set(existing.map((e) => e.label.toLowerCase()));
		const packing = plan.packing.filter((label) => {
			const key = label.trim().toLowerCase();
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		db.transaction((tx) => {
			if (rows.length) {
				tx.insert(timelineItem)
					.values(rows.map((r) => ({ ...r, tripId: params.id })))
					.run();
			}
			if (packing.length) {
				tx.insert(packingItem)
					.values(packing.map((label) => ({ tripId: params.id, label: label.trim() })))
					.run();
			}
			tx.update(tripPlan).set({ appliedAt: new Date() }).where(eq(tripPlan.id, id)).run();
		});
		redirect(303, `/trips/${params.id}`);
	},

	discard: async ({ params, request }) => {
		const id = field(await request.formData(), 'planId');
		await db.delete(tripPlan).where(and(eq(tripPlan.id, id), eq(tripPlan.tripId, params.id)));
	}
};
