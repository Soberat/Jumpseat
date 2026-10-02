import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { and, eq, lt } from 'drizzle-orm';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { db } from './db/index.ts';
import { tripPlan, type Flight, type TimelineItem, type Trip } from './db/schema.ts';
import {
	mergePlans,
	parsePlan,
	planParts,
	TripPlanSchema,
	type PlanRequest,
	type TripPlan
} from '#lib/plan.ts';
import { describeWhen } from '#lib/when.ts';
import { airportByCode } from '#lib/airports.ts';
import { DEFAULT_HOME } from '#lib/trip-route.ts';

export const MODEL = 'claude-opus-5-5';
export const plannerEnabled = () => Boolean(ANTHROPIC_API_KEY);

// Kept byte-for-byte stable so the prefix can be cached across plans.
const SYSTEM = `You are an experienced travel planner drafting a first itinerary for a self-hosted trip-planning app.

The traveller is an airline employee who often flies standby on staff tickets: arrival and departure days can slip by a few hours or a day. Keep the first and last day light and flexible, avoid non-refundable bookings early in the trip, and put anything that needs a fixed time (tours, reservations) in the middle days.

How to plan:
- Match the requested styles, budget level and wishes. If wishes conflict with styles, the wishes win.
- Group each day geographically so people aren't crossing the city back and forth. Include realistic transport between areas only when it matters (a train to a day-trip town, an airport transfer).
- Suggest real, well-established places by their actual names. Prefer places that have been around for years over the newest openings, since you can't check whether something is still open. Never invent addresses.
- Each day should have breakfast/lunch/dinner suggestions only where they add something; don't pad.
- Give every timed item a realistic duration and leave honest gaps for getting between places; the traveller plans minute by minute, so times plus durations must not overlap.
- Account for the season and weather of the travel dates (beach days only when it's warm enough, indoor options in rainy months).
- Respect anything already booked: build around existing stays, flights and plans instead of duplicating them.
- Estimated costs are rough, for the whole group, in the requested currency. The budget lines should add up to the total and fit the budget amount if one was given; say so in the summary if the request can't fit.
- Use "stay" items only to recommend where to sleep when nothing is booked yet; at most one per day.
- Keep the language plain and concise. Details are one or two sentences.`;

function describeExisting(flights: Flight[], items: TimelineItem[]): string {
	const lines = [
		...flights.map(
			(f) =>
				`- Flight ${f.flightNumber} ${f.origin}→${f.destination} on ${f.departureDate}${f.departureTime ? ` at ${f.departureTime}` : ''}${f.standby ? ' (standby, may change)' : ''}`
		),
		...items.map(
			(i) =>
				`- ${i.kind}${i.status === 'idea' ? ' idea' : ''}: ${i.title}${i.location ? ` (${i.location})` : ''}${i.startDate ? ` on ${i.startDate}${i.endDate && i.endDate !== i.startDate ? ` to ${i.endDate}` : ''}` : i.day ? ` on day ${i.day}` : ''}${i.startTime ? ` at ${i.startTime}` : ''}${i.durationMinutes ? ` for ${i.durationMinutes} min` : ''}`
		)
	];
	return lines.length ? lines.join('\n') : '- Nothing yet.';
}

function startingPoint(origin: string | null): string {
	const a = airportByCode(origin ?? DEFAULT_HOME);
	return a ? `${a.city} (${a.code})` : (origin ?? DEFAULT_HOME);
}

export function buildPrompt(
	trip: Pick<Trip, 'destination' | 'startDate' | 'endDate' | 'plannedPeriod' | 'origin'>,
	request: PlanRequest,
	flights: Flight[],
	items: TimelineItem[],
	/** For long trips drafted in parts: which days this call covers, and what's already planned. */
	part?: { from: number; to: number; earlier: TripPlan[] }
): string {
	const budget =
		request.budgetAmount !== null
			? `${request.budgetLevel}, about ${request.budgetAmount} ${request.currency} in total for the group (excluding flights)`
			: `${request.budgetLevel}; give costs in ${request.currency}`;
	return `Plan this trip.

Destination: ${trip.destination}
Travelling from: ${startingPoint(trip.origin)}
When: ${describeWhen(trip)}${trip.startDate ? ` (day 1 is ${trip.startDate})` : ''}
Length: ${request.days} day${request.days === 1 ? '' : 's'}${part ? '' : '; return exactly this many days'}.
Travellers: ${request.travellers}
Styles: ${request.styles.length ? request.styles.join(', ') : 'no preference'}
Budget: ${budget}
Wishes: ${request.wishes || 'none given'}

Already on the trip:
${describeExisting(flights, items)}${part ? describePart(request.days, part) : ''}`;
}

function describePart(
	days: number,
	part: { from: number; to: number; earlier: TripPlan[] }
): string {
	const span = part.to - part.from + 1;
	const lines = [
		'',
		'',
		`This trip is long, so it is planned in parts. Plan only days ${part.from} to ${part.to} now: return exactly ${span} days numbered ${part.from} to ${part.to}.`,
		`The budget in your answer covers only these ${span} days (about ${Math.round((100 * span) / days)}% of the trip's budget).`
	];
	if (part.from === 1) {
		lines.push(
			'Write the summary, where to stay, tips and packing for the whole trip, not just these days.'
		);
	} else {
		lines.push(
			'Keep the summary and where-to-stay short; they come from the first part. Add only tips and packing items not covered yet.',
			'Already planned in earlier parts (do not repeat these places; vary the days):',
			...part.earlier.flatMap((p) =>
				p.days.map(
					(d) =>
						`- Day ${d.day}: ${d.theme} (${d.items
							.filter((i) => i.kind !== 'stay')
							.map((i) => i.title)
							.join('; ')})`
				)
			)
		);
	}
	return lines.join('\n');
}

/** Calls Claude and stores the result on the plan row. Never throws. */
export async function generatePlan(
	planId: string,
	trip: Trip,
	request: PlanRequest,
	flights: Flight[],
	items: TimelineItem[]
): Promise<void> {
	try {
		const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
		const parts = planParts(request.days);
		const drafted: TripPlan[] = [];
		for (const [from, to] of parts) {
			const part = parts.length > 1 ? { from, to, earlier: drafted } : undefined;
			drafted.push(await draft(client, buildPrompt(trip, request, flights, items, part)));
		}
		const plan = mergePlans(drafted);

		await db
			.update(tripPlan)
			.set({ status: 'ready', plan: JSON.stringify(plan), error: null })
			.where(eq(tripPlan.id, planId));
	} catch (err) {
		console.error('Plan generation failed', err);
		await db
			.update(tripPlan)
			.set({ status: 'failed', error: friendlyError(err) })
			.where(eq(tripPlan.id, planId));
	}
}

async function draft(client: Anthropic, prompt: string): Promise<TripPlan> {
	// Streaming keeps the long request alive; we only need the final message.
	const stream = client.beta.messages.stream({
		model: MODEL,
		max_tokens: 32000,
		// Re-run on a fallback model if a safety classifier declines.
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		output_config: { effort: 'medium', format: zodOutputFormat(TripPlanSchema) },
		system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
		messages: [{ role: 'user', content: prompt }]
	});
	const message = await stream.finalMessage();

	if (message.stop_reason === 'refusal') throw new Error('Claude declined to plan this trip.');
	if (message.stop_reason === 'max_tokens') throw new Error('The plan came back cut off.');
	const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
	return parsePlan(JSON.parse(text));
}

function friendlyError(err: unknown): string {
	if (err instanceof Anthropic.AuthenticationError) return 'The Claude API key was rejected.';
	if (err instanceof Anthropic.PermissionDeniedError)
		return 'The Claude API key has no access to this model.';
	if (err instanceof Anthropic.RateLimitError)
		return 'Claude is rate limited right now. Try again in a minute.';
	if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude from the server.";
	if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status}).`;
	if (err instanceof Error && err.message.length < 120) return err.message;
	return 'Something went wrong while drafting the plan.';
}

/** A server restart loses in-flight requests; don't leave those spinning forever. */
export async function expireStalePlans(tripId: string): Promise<void> {
	// Long trips are drafted in several parts, one after another.
	const cutoff = new Date(Date.now() - 30 * 60 * 1000);
	await db
		.update(tripPlan)
		.set({ status: 'failed', error: 'Drafting took too long. Try again.' })
		.where(
			and(
				eq(tripPlan.tripId, tripId),
				eq(tripPlan.status, 'pending'),
				lt(tripPlan.createdAt, cutoff)
			)
		);
}
