import { formatNumericDate } from './format.ts';
import { formatMoney, parseAmount, totalsByCurrency } from './money.ts';

/** What a booking costs and whether it's settled: paid already, or to pay (by a date, maybe). */
export const PAYMENT_STATUSES = ['paid', 'due'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface Cost {
	costMinor: number | null;
	costCurrency: string | null;
	paymentStatus: PaymentStatus | null;
	dueDate: string | null;
}

export const NO_COST: Cost = {
	costMinor: null,
	costCurrency: null,
	paymentStatus: null,
	dueDate: null
};

export const DEFAULT_CURRENCY = 'PLN';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the cost fields of a form. An empty amount means no cost. */
export function parseCost(data: FormData): Cost | { error: string } {
	const read = (name: string) => String(data.get(name) ?? '').trim();
	const amount = read('costAmount');
	if (!amount) return NO_COST;
	const currency = (read('costCurrency') || DEFAULT_CURRENCY).toUpperCase();
	if (!/^[A-Z]{3}$/.test(currency)) {
		return { error: 'Use a three-letter currency code, like PLN.' };
	}
	const costMinor = parseAmount(amount, currency);
	if (costMinor === null) return { error: 'Enter the cost as an amount, like 450 or 89,90.' };
	const paymentStatus: PaymentStatus = read('paymentStatus') === 'due' ? 'due' : 'paid';
	const due = read('dueDate');
	return {
		costMinor,
		costCurrency: currency,
		paymentStatus,
		dueDate: paymentStatus === 'due' && DATE_RE.test(due) ? due : null
	};
}

export type CostTone = 'paid' | 'due' | 'overdue';

/** "1 250,00 zł · Paid", "89,90 € · To pay by 05.11.2026". */
export function describeCost(
	c: Cost,
	today: string
): { amount: string; status: string; tone: CostTone } | null {
	if (c.costMinor === null || !c.costCurrency) return null;
	const amount = formatMoney(c.costMinor, c.costCurrency);
	if (c.paymentStatus !== 'due') return { amount, status: 'Paid', tone: 'paid' };
	if (!c.dueDate) return { amount, status: 'To pay', tone: 'due' };
	const overdue = c.dueDate < today;
	return {
		amount,
		status: `${overdue ? 'Was due' : 'To pay by'} ${formatNumericDate(c.dueDate)}`,
		tone: overdue ? 'overdue' : 'due'
	};
}

export interface CostSummary {
	paid: { currency: string; minor: number }[];
	due: { currency: string; minor: number }[];
	/** The soonest payment still to make, if any has a date. */
	next: { label: string; date: string; amount: string } | null;
	overdue: number;
}

/** Adds up booking costs: what's paid and what's still to pay. */
export function summariseCosts(
	entries: (Cost & { label: string })[],
	today: string
): CostSummary | null {
	const priced = entries.flatMap((e) =>
		e.costMinor !== null && e.costCurrency
			? [{ ...e, amountMinor: e.costMinor, currency: e.costCurrency }]
			: []
	);
	if (priced.length === 0) return null;
	const due = priced.filter((e) => e.paymentStatus === 'due');
	const dated = due.filter((e) => e.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
	const upcoming = dated.find((e) => e.dueDate! >= today) ?? null;
	return {
		paid: totalsByCurrency(priced.filter((e) => e.paymentStatus !== 'due')),
		due: totalsByCurrency(due),
		next: upcoming
			? {
					label: upcoming.label,
					date: upcoming.dueDate!,
					amount: formatMoney(upcoming.amountMinor, upcoming.currency)
				}
			: null,
		overdue: dated.filter((e) => e.dueDate! < today).length
	};
}
