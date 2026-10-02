import { z } from 'zod';
import { addDays, daysBetween } from './climate.ts';
import { EXPENSE_CATEGORIES } from './money.ts';
import type { TimelineKind } from './timeline.ts';
import type { WhenWindow } from './when.ts';

export const TRIP_STYLES = [
	'city break',
	'sightseeing',
	'beach & sun',
	'food & drink',
	'culture & museums',
	'nature & hiking',
	'sports & active',
	'nightlife',
	'relaxing',
	'shopping'
] as const;

export const BUDGET_LEVELS = ['shoestring', 'moderate', 'comfortable', 'luxury'] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

export const BUDGET_LABELS: Record<BudgetLevel, string> = {
	shoestring: '🎒 Shoestring',
	moderate: '💶 Moderate',
	comfortable: '🛎️ Comfortable',
	luxury: '🥂 Luxury'
};

/** What the person asked for. Stored with the plan so it can be shown and re-run. */
export const PlanRequestSchema = z.object({
	styles: z.array(z.string()),
	budgetLevel: z.enum(BUDGET_LEVELS),
	budgetAmount: z.number().nullable(),
	currency: z.string(),
	travellers: z.number(),
	days: z.number(),
	wishes: z.string()
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

const PLAN_ITEM_KINDS = ['activity', 'restaurant', 'transport', 'stay'] as const;

/** The shape Claude must answer in (enforced with structured outputs). */
export const TripPlanSchema = z.object({
	summary: z.string().describe('Two or three sentences on the shape of the trip.'),
	whereToStay: z.object({
		area: z.string().describe('Neighbourhood or area to base yourself in.'),
		why: z.string(),
		priceRange: z.string().describe('Typical nightly price range for the budget, e.g. "€90–140".')
	}),
	days: z.array(
		z.object({
			day: z.number().describe('1 for the first day of the trip.'),
			theme: z.string().describe('Short headline for the day, e.g. "Alfama and the castle".'),
			items: z.array(
				z.object({
					time: z.string().nullable().describe('24-hour HH:MM, or null if flexible.'),
					durationMinutes: z
						.number()
						.nullable()
						.describe(
							'Realistic time it takes in minutes, including queues (e.g. 90 for dinner, 150 for a big museum). Null only for overnight stays.'
						),
					kind: z.enum(PLAN_ITEM_KINDS),
					title: z.string().describe('Name of the place or activity.'),
					location: z.string().nullable().describe('Area or address, short.'),
					details: z.string().describe('One or two sentences: why, and any practical tip.'),
					estimatedCost: z
						.number()
						.nullable()
						.describe('Rough cost for the whole group, in the budget currency.')
				})
			)
		})
	),
	budget: z.object({
		lines: z.array(
			z.object({
				category: z.enum(EXPENSE_CATEGORIES),
				amount: z.number(),
				note: z.string()
			})
		),
		total: z.number()
	}),
	tips: z
		.array(z.string())
		.describe('Practical local tips: transport passes, reservations, scams.'),
	packing: z.array(z.string()).describe('Items specific to this destination and these plans.')
});
export type TripPlan = z.infer<typeof TripPlanSchema>;
export type PlanItem = TripPlan['days'][number]['items'][number];

export const MAX_PLAN_DAYS = 60;
/** Longer plans are drafted in parts of at most this many days, one after another. */
export const PART_DAYS = 10;

/** Day ranges to draft separately: [[1, 10], [11, 20], …], evenly sized. A short trip is one part. */
export function planParts(days: number): [number, number][] {
	if (days <= 14) return [[1, days]];
	const count = Math.ceil(days / PART_DAYS);
	const size = Math.ceil(days / count);
	return Array.from({ length: count }, (_, i): [number, number] => [
		i * size + 1,
		Math.min(days, (i + 1) * size)
	]).filter(([a, b]) => a <= b);
}

/** Joins plans drafted in parts: the first part sets the scene, days and budgets add up. */
export function mergePlans(parts: TripPlan[]): TripPlan {
	const [first, ...rest] = parts;
	const lines = new Map<string, TripPlan['budget']['lines'][number]>();
	for (const line of parts.flatMap((p) => p.budget.lines)) {
		const seen = lines.get(line.category);
		if (seen) seen.amount += line.amount;
		else lines.set(line.category, { ...line });
	}
	const unique = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];
	return {
		...first,
		days: parts.flatMap((p) => p.days).sort((a, b) => a.day - b.day),
		budget: {
			lines: [...lines.values()],
			total: parts.reduce((sum, p) => sum + p.budget.total, 0)
		},
		tips: unique([...first.tips, ...rest.flatMap((p) => p.tips)]),
		packing: unique(parts.flatMap((p) => p.packing))
	};
}

/** Exact dates fix the length; otherwise the person chooses it. */
export function planLength(window: WhenWindow, requested: number): number {
	const days =
		window.type === 'exact' ? daysBetween(window.start, window.end) + 1 : Math.round(requested);
	return Math.min(Math.max(days, 1), MAX_PLAN_DAYS);
}

const KIND_MAP: Record<PlanItem['kind'], TimelineKind> = {
	activity: 'other',
	restaurant: 'restaurant',
	transport: 'transport',
	stay: 'stay'
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Timeline rows for a plan: dated when the trip has dates, "Day N" ideas otherwise. */
export function planToTimeline(plan: TripPlan, tripStart: string | null, currency: string) {
	return plan.days.flatMap((day) =>
		day.items
			// The stay recommendation is an area, not a booking; it is shown separately.
			.filter((item) => item.kind !== 'stay')
			.map((item) => {
				const cost =
					item.estimatedCost !== null && item.estimatedCost > 0
						? `About ${Math.round(item.estimatedCost)} ${currency}.`
						: null;
				return {
					kind: KIND_MAP[item.kind],
					title: item.title,
					status: 'idea' as const,
					startDate: tripStart ? addDays(tripStart, day.day - 1) : null,
					startTime: item.time && TIME_RE.test(item.time) ? item.time : null,
					durationMinutes:
						item.durationMinutes && item.durationMinutes > 0
							? Math.min(Math.round(item.durationMinutes), 12 * 60)
							: null,
					day: day.day,
					location: item.kind === 'transport' ? null : item.location,
					notes: [item.details, cost].filter(Boolean).join(' ') || null
				};
			})
	);
}

/**
 * The SDK sends enum constraints to the model as hints rather than hard rules,
 * so map anything unexpected to a safe value before validating.
 */
export function parsePlan(raw: unknown): TripPlan {
	const plan = raw as {
		days?: { items?: { kind?: unknown }[] }[];
		budget?: { lines?: { category?: unknown }[] };
	};
	for (const day of plan?.days ?? []) {
		for (const item of (day.items ?? []) as { kind?: unknown; durationMinutes?: unknown }[]) {
			// Plans made before durations existed don't have one.
			item.durationMinutes ??= null;
			const kind = String(item.kind).toLowerCase();
			item.kind = (PLAN_ITEM_KINDS as readonly string[]).includes(kind) ? kind : 'activity';
		}
	}
	for (const line of plan?.budget?.lines ?? []) {
		const category = String(line.category).toLowerCase();
		line.category = (EXPENSE_CATEGORIES as readonly string[]).includes(category)
			? category
			: 'other';
	}
	return TripPlanSchema.parse(plan);
}
