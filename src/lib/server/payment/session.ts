import { stripe } from "$lib/server/payment";
import * as table from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";

/**
 * Start and return a Stripe payment session. Creates a customer in Stripe if one does not exist for
 * the user and initializes a member relation.
 *
 * @param {string} userId
 * @param {string} membershipId
 * @see {@link https://docs.stripe.com/checkout/quickstart}
 */
export async function createSession(userId: string, membershipId: string) {
	const membership = await db.query.membership.findFirst({
		where: eq(table.membership.id, membershipId),
	});
	const user = await db.query.user.findFirst({
		where: eq(table.user.id, userId),
	});
	if (!membership || !user) {
		throw new Error("Membership or user not found");
	}

	let stripeCustomerId = user.stripeCustomerId;
	if (!stripeCustomerId) {
		// https://docs.stripe.com/api/customers/create
		const customer = await stripe.customers.create({
			email: user.email,
			name: `${user.firstNames} ${user.lastName}`,
			metadata: { userId },
		});
		stripeCustomerId = customer.id;

		await db.update(table.user).set({ stripeCustomerId }).where(eq(table.user.id, userId));
	}

	const memberId = crypto.randomUUID();
	// https://docs.stripe.com/api/checkout/sessions/create
	const session = await stripe.checkout.sessions.create({
		line_items: [
			{
				price: membership.stripePriceId,
				quantity: 1,
			},
		],
		mode: "payment",
		customer: stripeCustomerId,
		success_url: "http://localhost:5173/fi",
		cancel_url: "http://localhost:5173/fi",
		metadata: { memberId },
	});
	await db.insert(table.member).values({
		id: memberId,
		userId: userId,
		membershipId: membershipId,
		stripeSessionId: session.id,
		status: "awaiting_payment",
	});

	return session;
}

/**
 * @param {string} sessionId
 * @see {@link https://docs.stripe.com/checkout/fulfillment}
 */
export async function fulfillSession(sessionId: string) {
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	if (session.payment_status === "unpaid") {
		return;
	}
	const member = await db.query.member.findFirst({
		where: eq(table.member.stripeSessionId, sessionId),
	});
	if (!member || member.status !== "awaiting_payment") {
		return;
	}
	await db.update(table.member).set({ status: "awaiting_approval" }).where(eq(table.member.id, member.id));
}

/**
 * @param {string} sessionId
 * @see {@link https://docs.stripe.com/checkout/fulfillment}
 */
export async function cancelSession(sessionId: string) {
	const session = await stripe.checkout.sessions.retrieve(sessionId);
	if (session.payment_status !== "unpaid") {
		return;
	}
	const member = await db.query.member.findFirst({
		where: eq(table.member.stripeSessionId, sessionId),
	});
	if (!member || member.status !== "awaiting_payment") {
		return;
	}
	await db.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, member.id));
}
