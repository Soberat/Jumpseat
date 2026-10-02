import { describeWhen, type TripWhen } from './when.ts';

/** "Lisbon · 3 – 7 Oct 2026", "Tokyo · Q2 2027 (Apr – Jun)", "Oslo · Dates not set". */
export function placeAndWhen(place: string, when: TripWhen): string {
	return `${place} · ${describeWhen(when)}`;
}
