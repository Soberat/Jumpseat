import { NUMBER_LOCALE } from './format.ts';
export const EXPENSE_CATEGORIES = [
	'flights',
	'stay',
	'transport',
	'food',
	'activities',
	'shopping',
	'other'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
	flights: '✈️ Flights & fees',
	stay: '🏨 Stay',
	transport: '🚆 Getting around',
	food: '🍽️ Food & drink',
	activities: '🎟️ Activities',
	shopping: '🛍️ Shopping',
	other: '📌 Other'
};

export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'JPY'] as const;

/** Currencies written without decimals. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'ISK', 'HUF', 'CLP', 'VND', 'IDR']);

export function minorDigits(currency: string): number {
	return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

/** "12,50" or "12.5" → 1250 minor units; null when it isn't a positive amount. */
export function parseAmount(input: string, currency: string): number | null {
	const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
	if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
	const digits = minorDigits(currency);
	const minor = Math.round(Number(cleaned) * 10 ** digits);
	return minor > 0 ? minor : null;
}

export function formatMoney(minor: number, currency: string, locale = NUMBER_LOCALE): string {
	const digits = minorDigits(currency);
	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(minor / 10 ** digits);
	} catch {
		return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
	}
}

/** Totals per currency, largest first. No exchange rates: amounts stay in what you paid. */
export function totalsByCurrency(
	expenses: { amountMinor: number; currency: string }[]
): { currency: string; minor: number }[] {
	const totals = new Map<string, number>();
	for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amountMinor);
	return [...totals]
		.map(([currency, minor]) => ({ currency, minor }))
		.sort((a, b) => b.minor - a.minor);
}
