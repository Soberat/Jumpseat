import { eq } from 'drizzle-orm';
import { db } from './db/index.ts';
import { exchangeRate } from './db/schema.ts';
import type { Rates } from '#lib/settle.ts';

// Frankfurter serves the ECB's daily reference rates, free and without a key.
const API = 'https://api.frankfurter.dev/v1';
const TIMEOUT_MS = 5000;
// Today's rates are refreshed through the day; a past day's never change.
const FRESH_MS = 6 * 60 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Rates for a day (a future day gets today's). Cached in the database, so a failed
 * lookup falls back to what was fetched before; null only when there's nothing at all.
 */
export async function ratesOn(date: string, fetcher = fetch): Promise<Rates | null> {
	const day = date > today() ? today() : date;
	const [cached] = await db.select().from(exchangeRate).where(eq(exchangeRate.date, day));
	const fresh = cached && (day < today() || Date.now() - cached.fetchedAt.getTime() < FRESH_MS);
	if (cached && fresh) return JSON.parse(cached.rates);

	try {
		const res = await fetcher(`${API}/${day === today() ? 'latest' : day}?base=EUR`, {
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
		const body = (await res.json()) as { rates?: Rates };
		if (!body.rates) throw new Error('No rates');
		const rates = { ...body.rates, EUR: 1 };
		await db
			.insert(exchangeRate)
			.values({ date: day, rates: JSON.stringify(rates), fetchedAt: new Date() })
			.onConflictDoUpdate({
				target: exchangeRate.date,
				set: { rates: JSON.stringify(rates), fetchedAt: new Date() }
			});
		return rates;
	} catch (err) {
		console.warn('Exchange rates unavailable', day, (err as Error).message);
		if (cached) return JSON.parse(cached.rates);
		return null;
	}
}

/** Rates for each of the given days, looked up once per day. */
export async function ratesFor(dates: string[]): Promise<Map<string, Rates | null>> {
	const days = [...new Set(dates)];
	const found = await Promise.all(days.map((d) => ratesOn(d)));
	return new Map(days.map((d, i) => [d, found[i]]));
}
