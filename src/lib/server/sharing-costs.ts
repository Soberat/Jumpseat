import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from './db/index.ts';
import { attachment, expense, trip, tripMember, type Expense } from './db/schema.ts';
import { field, optionalField } from './trips.ts';
import { ratesFor } from './fx.ts';
import { pruneUploads, savePhoto } from './uploads.ts';
import { convert, rateDate, settle, type Rates } from '#lib/settle.ts';

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Everything the Expenses card needs beyond the raw rows: who's on the trip, what
 * each expense comes to in the settle currency, and who owes whom.
 */
export async function loadMoney(
	tripId: string,
	settleCurrency: string,
	expenses: Expense[],
	costs: { costMinor: number | null; costCurrency: string | null; paymentStatus: string | null }[]
) {
	const members = await db
		.select()
		.from(tripMember)
		.where(eq(tripMember.tripId, tripId))
		.orderBy(asc(tripMember.createdAt));
	const today = new Date().toISOString().slice(0, 10);
	const rates = await ratesFor([today, ...expenses.map(rateDate)]);
	const ratesOn = (d: string): Rates | null => rates.get(d) ?? null;

	const settlement = settle(
		expenses,
		members.map((m) => m.id),
		settleCurrency,
		ratesOn
	);
	const spent = expenses.filter((e) => !e.transfer);
	const total = sumConverted(spent.map((e) => settlement.converted[e.id]));
	// Bookings are converted at today's rates.
	const priced = costs.filter((c) => c.costMinor !== null && c.costCurrency);
	const bookings = (status: 'paid' | 'due') =>
		sumConverted(
			priced
				.filter((c) => (c.paymentStatus === 'due') === (status === 'due'))
				.map((c) => convert(c.costMinor!, c.costCurrency!, settleCurrency, ratesOn(today)))
		);

	return {
		members,
		settleCurrency,
		settlement,
		total,
		bookingsPaid: bookings('paid'),
		bookingsDue: bookings('due'),
		ratesMissing: rates.get(today) === null
	};
}

/** Total of converted amounts, and how many couldn't be converted. */
function sumConverted(values: (number | null)[]): { minor: number; missing: number } {
	return values.reduce<{ minor: number; missing: number }>(
		(acc, v) =>
			v === null ? { ...acc, missing: acc.missing + 1 } : { ...acc, minor: acc.minor + v },
		{ minor: 0, missing: 0 }
	);
}

/** "Paid by" and "split between" from the add-expense form. */
export async function readSplit(
	tripId: string,
	data: FormData
): Promise<{ paidBy: string | null; splitWith: string | null } | { error: string }> {
	const members = await db
		.select({ id: tripMember.id })
		.from(tripMember)
		.where(eq(tripMember.tripId, tripId));
	const ids = members.map((m) => m.id);
	const paidBy = optionalField(data, 'paidBy');
	if (!paidBy || !ids.includes(paidBy)) return { paidBy: null, splitWith: null };
	const chosen = data
		.getAll('splitWith')
		.map(String)
		.filter((id) => ids.includes(id));
	if (chosen.length === 0) return { error: 'Pick who to split it with.' };
	// Everyone means everyone, including people added later.
	return { paidBy, splitWith: chosen.length === ids.length ? null : JSON.stringify(chosen) };
}

export const moneyActions = {
	async addMember(tripId: string, request: Request) {
		const name = field(await request.formData(), 'name').slice(0, 40);
		if (!name) return fail(400, { memberError: 'Type a name.' });
		await db.insert(tripMember).values({ tripId, name });
	},

	async removeMember(tripId: string, request: Request) {
		const id = field(await request.formData(), 'id');
		// Their expenses stay, just no longer counted as paid by anyone.
		await db
			.update(expense)
			.set({ paidBy: null })
			.where(and(eq(expense.tripId, tripId), eq(expense.paidBy, id)));
		await db.delete(tripMember).where(and(eq(tripMember.id, id), eq(tripMember.tripId, tripId)));
	},

	async setSettleCurrency(tripId: string, request: Request) {
		const currency = field(await request.formData(), 'currency').toUpperCase();
		if (!CURRENCY_RE.test(currency)) {
			return fail(400, { expenseError: 'Use a three-letter currency code, like PLN.' });
		}
		await db.update(trip).set({ settleCurrency: currency }).where(eq(trip.id, tripId));
	},

	/** Records one "settle up" payment as a transfer between two people. */
	async settleTransfer(tripId: string, request: Request) {
		const data = await request.formData();
		const [from, to] = [field(data, 'from'), field(data, 'to')];
		const currency = field(data, 'currency');
		const amountMinor = Number(field(data, 'minor'));
		const members = await db.select().from(tripMember).where(eq(tripMember.tripId, tripId));
		const name = (id: string) => members.find((m) => m.id === id)?.name;
		if (!name(from) || !name(to) || !(amountMinor > 0) || !CURRENCY_RE.test(currency)) {
			return fail(400, { expenseError: "That payment doesn't match this trip any more." });
		}
		await db.insert(expense).values({
			tripId,
			description: `${name(from)} paid ${name(to)} back`,
			amountMinor,
			currency,
			category: 'other',
			spentOn: new Date().toISOString().slice(0, 10),
			paidBy: from,
			splitWith: JSON.stringify([to]),
			transfer: true
		});
	}
};

const TARGETS = ['item', 'flight', 'expense'] as const;

export const attachmentActions = {
	async addAttachment(tripId: string, request: Request) {
		const data = await request.formData();
		const target = field(data, 'target') as (typeof TARGETS)[number];
		const id = field(data, 'id');
		if (!TARGETS.includes(target) || !id)
			return fail(400, { attachError: 'Nothing to attach to.', attachFor: id });
		const owner = { itemId: null, flightId: null, expenseId: null, [`${target}Id`]: id };
		const label = optionalField(data, 'label');

		const photo = data.get('photo');
		if (photo instanceof File && photo.size > 0) {
			try {
				const name = await savePhoto(tripId, photo);
				await db.insert(attachment).values({ tripId, ...owner, kind: 'photo', url: name, label });
			} catch (err) {
				return fail(400, { attachError: (err as Error).message, attachFor: id });
			}
			return;
		}
		const url = field(data, 'url');
		if (!/^https?:\/\/\S+$/i.test(url)) {
			return fail(400, {
				attachError: 'Links must start with http:// or https://.',
				attachFor: id
			});
		}
		await db.insert(attachment).values({ tripId, ...owner, kind: 'link', url, label });
	},

	async deleteAttachment(tripId: string, request: Request) {
		const id = field(await request.formData(), 'id');
		await db.delete(attachment).where(and(eq(attachment.id, id), eq(attachment.tripId, tripId)));
		await pruneUploads(tripId);
	}
};
