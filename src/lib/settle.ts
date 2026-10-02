import { minorDigits } from './money.ts';

/** Units of each currency per 1 EUR, for one day (ECB reference rates). */
export type Rates = Record<string, number>;

/** Converts minor units between currencies; null when either currency has no rate. */
export function convert(
	minor: number,
	from: string,
	to: string,
	rates: Rates | null
): number | null {
	if (from === to) return minor;
	const rFrom = from === 'EUR' ? 1 : rates?.[from];
	const rTo = to === 'EUR' ? 1 : rates?.[to];
	if (!rFrom || !rTo) return null;
	const amount = minor / 10 ** minorDigits(from);
	return Math.round((amount / rFrom) * rTo * 10 ** minorDigits(to));
}

/** The day an expense's rate is taken from: when it was spent, else when it was logged. */
export function rateDate(e: { spentOn: string | null; createdAt: Date }): string {
	return e.spentOn ?? e.createdAt.toISOString().slice(0, 10);
}

/** Splits minor units into n near-equal shares that add up exactly (the first ones get the extra cent). */
export function shares(minor: number, n: number): number[] {
	const base = Math.floor(minor / n);
	return Array.from({ length: n }, (_, i) => base + (i < minor - base * n ? 1 : 0));
}

/** Member ids an expense is split between: its own list, or everyone on the trip. */
export function splitIds(splitWith: string | null, memberIds: string[]): string[] {
	if (!splitWith) return memberIds;
	try {
		const ids: unknown = JSON.parse(splitWith);
		return Array.isArray(ids) ? memberIds.filter((m) => ids.includes(m)) : memberIds;
	} catch {
		return memberIds;
	}
}

interface SettleExpense {
	id: string;
	amountMinor: number;
	currency: string;
	paidBy: string | null;
	splitWith: string | null;
	spentOn: string | null;
	createdAt: Date;
}

export interface Settlement {
	currency: string;
	/** Each expense in the settle currency, null when it couldn't be converted. */
	converted: Record<string, number | null>;
	/** What each person is owed (positive) or owes (negative). */
	balances: { memberId: string; minor: number }[];
	/** Who pays whom to even out, fewest payments first. */
	transfers: { from: string; to: string; minor: number }[];
	/** Shared expenses left out because there was no exchange rate. */
	skipped: number;
}

/**
 * Adds up who paid what and who shares it, in one currency. Only expenses with a payer
 * count; transfers (paying someone back) are expenses split with just the person paid.
 */
export function settle(
	expenses: SettleExpense[],
	memberIds: string[],
	currency: string,
	ratesOn: (date: string) => Rates | null
): Settlement {
	const converted: Record<string, number | null> = {};
	const balance = new Map(memberIds.map((id) => [id, 0]));
	let skipped = 0;
	for (const e of expenses) {
		const minor = convert(e.amountMinor, e.currency, currency, ratesOn(rateDate(e)));
		converted[e.id] = minor;
		if (!e.paidBy || !balance.has(e.paidBy)) continue;
		const among = splitIds(e.splitWith, memberIds);
		if (among.length === 0) continue;
		if (minor === null) {
			skipped++;
			continue;
		}
		balance.set(e.paidBy, balance.get(e.paidBy)! + minor);
		shares(minor, among.length).forEach((s, i) =>
			balance.set(among[i], balance.get(among[i])! - s)
		);
	}
	const balances = [...balance].map(([memberId, minor]) => ({ memberId, minor }));
	return { currency, converted, balances, transfers: settleUp(balances), skipped };
}

/** Greedy: the biggest debtor pays the biggest creditor until everyone is square. */
export function settleUp(
	balances: { memberId: string; minor: number }[]
): { from: string; to: string; minor: number }[] {
	const owed = balances.filter((b) => b.minor > 0).map((b) => ({ ...b }));
	const owing = balances.filter((b) => b.minor < 0).map((b) => ({ ...b, minor: -b.minor }));
	const out: { from: string; to: string; minor: number }[] = [];
	while (owed.length && owing.length) {
		owed.sort((a, b) => b.minor - a.minor);
		owing.sort((a, b) => b.minor - a.minor);
		const [c, d] = [owed[0], owing[0]];
		const minor = Math.min(c.minor, d.minor);
		if (minor > 0) out.push({ from: d.memberId, to: c.memberId, minor });
		c.minor -= minor;
		d.minor -= minor;
		if (c.minor === 0) owed.shift();
		if (d.minor === 0) owing.shift();
	}
	return out;
}
