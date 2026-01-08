import { stripe } from "$lib/server/payment";
import * as table from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";
import { env } from "$lib/server/env";
import type { Locale } from "$lib/i18n/routing";
import { logger } from "$lib/server/telemetry";

/**
 * Start and return a Stripe payment session. Creates a customer in Stripe if one does not exist for
 * the user and initializes a member relation.
 *
 * @see {@link https://docs.stripe.com/checkout/quickstart}
 */
export async function createSession(userId: string, membershipId: string, locale: Locale) {
	return logger.startSpan("stripe.checkout.create_session", async (span) => {
		span.setAttribute("user.id", userId);
		span.setAttribute("membership.id", membershipId);

		const membership = await db.query.membership.findFirst({
			where: eq(table.membership.id, membershipId),
		});
		const user = await db.query.user.findFirst({
			where: eq(table.user.id, userId),
		});
		if (!membership || !user) {
			logger.error("stripe.checkout.not_found", undefined, {
				"user.id": userId,
				"membership.id": membershipId,
				"membership.found": String(!!membership),
				"user.found": String(!!user),
			});
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

			logger.info("stripe.customer.created", {
				"user.id": userId,
				"stripe.customer.id": stripeCustomerId,
			});
		}

		const memberId = crypto.randomUUID();
		const publicUrl = env.PUBLIC_URL;

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
			success_url: `${publicUrl}/${locale}?stripeStatus=success`,
			cancel_url: `${publicUrl}/${locale}?stripeStatus=cancel`,
			metadata: { memberId },
		});

		await db.insert(table.member).values({
			id: memberId,
			userId: userId,
			membershipId: membershipId,
			stripeSessionId: session.id,
			status: "awaiting_payment",
		});

		span.setAttribute("member.id", memberId);
		span.setAttribute("stripe.session.id", session.id);
		span.setAttribute("stripe.customer.id", stripeCustomerId);

		logger.info("stripe.checkout.session_created", {
			"user.id": userId,
			"member.id": memberId,
			"stripe.session.id": session.id,
			"membership.id": membershipId,
		});

		return session;
	});
}

/**
 * @param {string} sessionId
 * @see {@link https://docs.stripe.com/checkout/fulfillment}
 */
export async function fulfillSession(sessionId: string) {
	return logger.startSpan("stripe.session.fulfill", async (span) => {
		span.setAttribute("stripe.session.id", sessionId);

		const session = await stripe.checkout.sessions.retrieve(sessionId);
		if (session.payment_status === "unpaid") {
			logger.warn("stripe.session.fulfill_unpaid", {
				"stripe.session.id": sessionId,
				"payment.status": session.payment_status,
			});
			return;
		}

		// Use transaction to prevent race condition if multiple webhooks arrive simultaneously
		await db.transaction(async (tx) => {
			const member = await tx.query.member.findFirst({
				where: eq(table.member.stripeSessionId, sessionId),
			});
			if (!member || member.status !== "awaiting_payment") {
				// Already processed or not found
				logger.warn("stripe.session.fulfill_skipped", {
					"stripe.session.id": sessionId,
					"member.found": String(!!member),
					"member.status": member?.status,
				});
				return;
			}
			await tx.update(table.member).set({ status: "awaiting_approval" }).where(eq(table.member.id, member.id));

			span.setAttribute("member.id", member.id);
			span.setAttribute("user.id", member.userId);

			logger.info("stripe.session.fulfilled", {
				"stripe.session.id": sessionId,
				"member.id": member.id,
				"user.id": member.userId,
			});
		});
	});
}

/**
 * @param {string} sessionId
 * @see {@link https://docs.stripe.com/checkout/fulfillment}
 */
export async function cancelSession(sessionId: string) {
	return logger.startSpan("stripe.session.cancel", async (span) => {
		span.setAttribute("stripe.session.id", sessionId);

		const session = await stripe.checkout.sessions.retrieve(sessionId);
		if (session.payment_status !== "unpaid") {
			logger.warn("stripe.session.cancel_paid", {
				"stripe.session.id": sessionId,
				"payment.status": session.payment_status,
			});
			return;
		}

		// Use transaction to prevent race condition if multiple webhooks arrive simultaneously
		await db.transaction(async (tx) => {
			const member = await tx.query.member.findFirst({
				where: eq(table.member.stripeSessionId, sessionId),
			});
			if (!member || member.status !== "awaiting_payment") {
				// Already processed or not found
				logger.warn("stripe.session.cancel_skipped", {
					"stripe.session.id": sessionId,
					"member.found": String(!!member),
					"member.status": member?.status,
				});
				return;
			}
			await tx.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, member.id));

			span.setAttribute("member.id", member.id);
			span.setAttribute("user.id", member.userId);

			logger.info("stripe.session.cancelled", {
				"stripe.session.id": sessionId,
				"member.id": member.id,
				"user.id": member.userId,
			});
		});
	});
}
