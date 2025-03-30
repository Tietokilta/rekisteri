import { route } from "$lib/ROUTES";
import { stripe } from "$lib/server/payment";
import * as table from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";
import { fail } from "@sveltejs/kit";

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
		return fail(400, {
			message: "Cannot purchase non-existent membership and/or user",
		});
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
				price: membership.stripeProductId,
				quantity: 1,
			},
		],
		mode: "payment",
		customer: stripeCustomerId,
		success_url: route("/"),
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
