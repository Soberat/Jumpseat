/** "Lisbon · 2026-10-10 – 2026-10-14", leaving out whatever dates are missing. */
export function placeAndDates(place: string, start: string | null, end: string | null): string {
	if (!start) return place;
	return end ? `${place} · ${start} – ${end}` : `${place} · ${start}`;
}
