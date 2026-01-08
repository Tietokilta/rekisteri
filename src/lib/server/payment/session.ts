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
		if (!membership.stripePriceId) {
			throw new Error("Membership has no Stripe price ID (legacy membership)");
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
 * Resume an existing payment session or create a new one if the old session has expired.
 * This is used when a user with "awaiting_payment" status wants to complete their payment.
 */
export async function resumeOrCreateSession(memberId: string, locale: Locale) {
	return logger.startSpan("stripe.checkout.resume_or_create", async (span) => {
		span.setAttribute("member.id", memberId);

		const member = await db.query.member.findFirst({
			where: eq(table.member.id, memberId),
			with: {
				membership: true,
				user: true,
			},
		});

		if (!member || member.status !== "awaiting_payment") {
			logger.error("stripe.checkout.resume_invalid_member", undefined, {
				"member.id": memberId,
				"member.found": String(!!member),
				"member.status": member?.status,
			});
			throw new Error("Member not found or not in awaiting_payment status");
		}

		span.setAttribute("user.id", member.userId);
		span.setAttribute("membership.id", member.membershipId);

		// Check if membership period is still valid (not expired)
		if (member.membership.endTime < new Date()) {
			logger.warn("stripe.checkout.resume_expired_period", {
				"member.id": memberId,
				"membership.id": member.membershipId,
			});
			throw new Error("Cannot resume payment for an expired membership period");
		}

		// Try to retrieve existing Stripe session
		if (member.stripeSessionId) {
			try {
				const existingSession = await stripe.checkout.sessions.retrieve(member.stripeSessionId);

				// If session is still open, return its URL
				if (existingSession.status === "open" && existingSession.url) {
					logger.info("stripe.checkout.session_resumed", {
						"member.id": memberId,
						"stripe.session.id": member.stripeSessionId,
					});
					span.setAttribute("stripe.session.id", member.stripeSessionId);
					span.setAttribute("session.is_new", false);
					return { url: existingSession.url, isNew: false };
				}

				// If payment was already completed, don't create a new session.
				// The webhook will process the payment shortly.
				if (existingSession.payment_status === "paid") {
					logger.warn("stripe.checkout.resume_already_paid", {
						"member.id": memberId,
						"stripe.session.id": member.stripeSessionId,
					});
					throw new Error("Your payment is being processed. Your membership will be activated shortly.");
				}
			} catch (error) {
				// Re-throw our custom error about payment being processed
				if (error instanceof Error && error.message.includes("Your payment is being processed")) {
					throw error;
				}
				// Session doesn't exist or is expired, will create a new one
				logger.warn("stripe.checkout.session_retrieval_failed", {
					"member.id": memberId,
					"stripe.session.id": member.stripeSessionId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// Create a new Stripe session
		const { membership, user } = member;
		if (!membership.stripePriceId) {
			logger.error("stripe.checkout.resume_no_price_id", undefined, {
				"member.id": memberId,
				"membership.id": membership.id,
			});
			throw new Error("Membership has no Stripe price ID");
		}

		let stripeCustomerId = user.stripeCustomerId;
		if (!stripeCustomerId) {
			const customer = await stripe.customers.create({
				email: user.email,
				name: `${user.firstNames} ${user.lastName}`,
				metadata: { userId: user.id },
			});
			stripeCustomerId = customer.id;
			await db.update(table.user).set({ stripeCustomerId }).where(eq(table.user.id, user.id));

			logger.info("stripe.customer.created", {
				"user.id": user.id,
				"stripe.customer.id": stripeCustomerId,
			});
		}

		const publicUrl = env.PUBLIC_URL;
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

		if (!session.url) {
			logger.error("stripe.checkout.session_no_url", undefined, {
				"member.id": memberId,
				"stripe.session.id": session.id,
			});
			throw new Error("Stripe checkout session was created without a URL");
		}

		// Update member record with new session ID
		await db.update(table.member).set({ stripeSessionId: session.id }).where(eq(table.member.id, memberId));

		span.setAttribute("stripe.session.id", session.id);
		span.setAttribute("session.is_new", true);

		logger.info("stripe.checkout.session_created_resume", {
			"member.id": memberId,
			"stripe.session.id": session.id,
			"membership.id": membership.id,
		});

		return { url: session.url, isNew: true };
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

		// Get memberId from session metadata - this is more reliable than stripeSessionId
		// because stripeSessionId can be overwritten if user retries payment
		const memberId = session.metadata?.memberId;
		if (!memberId) {
			logger.error("stripe.session.fulfill_no_member_id", undefined, {
				"stripe.session.id": sessionId,
			});
			return;
		}

		// Use transaction to prevent race condition if multiple webhooks arrive simultaneously
		await db.transaction(async (tx) => {
			const member = await tx.query.member.findFirst({
				where: eq(table.member.id, memberId),
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

		// Get memberId from session metadata - this is more reliable than stripeSessionId
		// because stripeSessionId can be overwritten if user retries payment
		const memberId = session.metadata?.memberId;
		if (!memberId) {
			logger.error("stripe.session.cancel_no_member_id", undefined, {
				"stripe.session.id": sessionId,
			});
			return;
		}

		// Use transaction to prevent race condition if multiple webhooks arrive simultaneously
		await db.transaction(async (tx) => {
			const member = await tx.query.member.findFirst({
				where: eq(table.member.id, memberId),
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
