import type { Flight, StandbyLoad } from '#lib/server/db/schema.ts';

export type Odds = 'good' | 'tight' | 'unlikely';

export interface FlightOdds {
	odds: Odds;
	/** Open seats minus people already listed; negative when oversubscribed. */
	margin: number;
	load: StandbyLoad;
}

export const ODDS_LABELS: Record<Odds, string> = {
	good: 'Good chance',
	tight: 'Tight',
	unlikely: 'Unlikely'
};

/** With this many spare seats after everyone listed ahead of you, you're very likely on. */
const COMFORTABLE_MARGIN = 5;

/** Rates a flight from its most recent load: open seats against the standby list. */
export function oddsFor(loads: StandbyLoad[]): FlightOdds | null {
	const load = loads.reduce<StandbyLoad | null>(
		(latest, l) => (!latest || l.recordedAt > latest.recordedAt ? l : latest),
		null
	);
	if (!load) return null;
	const margin = load.seatsAvailable - (load.standbyListed ?? 0);
	const odds: Odds = margin >= COMFORTABLE_MARGIN ? 'good' : margin > 0 ? 'tight' : 'unlikely';
	return { odds, margin, load };
}

/** Standby flights on the same route and day are alternatives for the same leg. */
export function legKey(f: Pick<Flight, 'origin' | 'destination' | 'departureDate'>): string {
	return `${f.origin}-${f.destination}-${f.departureDate}`;
}

/**
 * For each leg with more than one standby option, the flight with the most
 * room to spare. Flights without a load yet can't be compared and are skipped.
 */
export function bestOptions(flights: Flight[], loads: StandbyLoad[]): Set<string> {
	const legs = new Map<string, Flight[]>();
	for (const f of flights) {
		if (!f.standby) continue;
		const key = legKey(f);
		legs.set(key, [...(legs.get(key) ?? []), f]);
	}

	const best = new Set<string>();
	for (const options of legs.values()) {
		if (options.length < 2) continue;
		let top: { id: string; margin: number } | null = null;
		for (const f of options) {
			const rated = oddsFor(loads.filter((l) => l.flightId === f.id));
			if (rated && (!top || rated.margin > top.margin)) top = { id: f.id, margin: rated.margin };
		}
		if (top) best.add(top.id);
	}
	return best;
}
