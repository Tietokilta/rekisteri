import { stripe } from "$lib/server/payment";
import * as table from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";
import { env } from "$lib/server/env";
import type { Locale } from "$lib/i18n/routing";
import Stripe from "stripe";
import { checkAutoApprovalEligibility } from "./auto-approval";
import type { AuditAction } from "$lib/server/audit";
import { encodeBase32LowerCase } from "@oslojs/encoding";
import { sendMemberEmail } from "$lib/server/emails";
import { getMembershipName } from "$lib/server/utils/membership";
import { getUserLocale } from "$lib/server/utils/user";
import { formatUserName, getDisplayFirstName } from "$lib/utils";
import { logger } from "$lib/server/telemetry";

/**
 * Checks if a Stripe error is due to a non-existent customer.
 * This typically happens after migrating from Stripe sandbox to production,
 * where sandbox customer IDs are stored but no longer valid.
 *
 * Uses Stripe's own error types for proper type checking.
 */
function isNoSuchCustomerError(error: unknown): error is Stripe.errors.StripeInvalidRequestError {
  // Use instanceof to check if error is a Stripe invalid request error
  // This is more robust than checking constructor.name which can fail with minification
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.message.includes("No such customer");
}

/**
 * Creates a new Stripe customer for the user and updates the database.
 * This is used when creating a checkout session and also when recovering from invalid customer IDs.
 */
async function createStripeCustomer(userId: string, email: string, name: string): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });

  await db.update(table.user).set({ stripeCustomerId: customer.id }).where(eq(table.user.id, userId));

  logger.info("stripe.customer.created", {
    "user.id": userId,
    "stripe.customer.id": customer.id,
  });

  return customer.id;
}

/**
 * Handles the case where a stored Stripe customer ID is no longer valid in Stripe.
 * This nulls out the invalid ID in the database and creates a new customer.
 */
async function handleInvalidCustomerId(userId: string, invalidCustomerId: string): Promise<void> {
  logger.error("stripe.customer.invalid_id_recovery", undefined, {
    "user.id": userId,
    "stripe.customer.id.invalid": invalidCustomerId,
    recovery: "nulling invalid ID and creating new customer",
  });

  // Null out the invalid customer ID
  await db.update(table.user).set({ stripeCustomerId: null }).where(eq(table.user.id, userId));
}

/**
 * Creates a Stripe checkout session with automatic retry on invalid customer ID.
 * If the customer ID is invalid (e.g., after Stripe environment migration), it automatically
 * creates a new customer and retries the session creation.
 */
async function createCheckoutSessionWithRetry(
  userId: string,
  email: string,
  name: string,
  customerId: string,
  stripePriceId: string,
  locale: Locale,
  memberId: string,
): Promise<Stripe.Response<Stripe.Checkout.Session>> {
  const publicUrl = env.PUBLIC_URL;
  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    line_items: [
      {
        price: stripePriceId,
        quantity: 1,
      },
    ],
    mode: "payment",
    customer: customerId,
    success_url: `${publicUrl}/${locale}?stripeStatus=success`,
    cancel_url: `${publicUrl}/${locale}?stripeStatus=cancel`,
    metadata: { memberId },
  };

  try {
    return await stripe.checkout.sessions.create(sessionConfig);
  } catch (error) {
    // Handle case where stored customer ID is invalid (e.g., after Stripe environment migration)
    if (isNoSuchCustomerError(error)) {
      await handleInvalidCustomerId(userId, customerId);
      // Create a new customer and retry
      const newCustomerId = await createStripeCustomer(userId, email, name);
      // Retry session creation with new customer ID
      sessionConfig.customer = newCustomerId;
      logger.info("stripe.checkout.session_retry_new_customer", {
        "user.id": userId,
        "stripe.customer.id.old": customerId,
        "stripe.customer.id.new": newCustomerId,
      });
      return await stripe.checkout.sessions.create(sessionConfig);
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Start and return a Stripe payment session. Creates a customer in Stripe if one does not exist for
 * the user and initializes a member relation.
 *
 * @see {@link https://docs.stripe.com/checkout/quickstart}
 */
export async function createSession(userId: string, membershipId: string, locale: Locale, description?: string | null) {
  return logger.startSpan("stripe.checkout.create_session", async (span) => {
    span.setAttribute("user.id", userId);
    span.setAttribute("membership.id", membershipId);

    const membership = await db.query.membership.findFirst({
      where: eq(table.membership.id, membershipId),
      with: { membershipType: true },
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
    if (!membership.membershipType.purchasable) {
      throw new Error("This membership type is not available for purchase");
    }
    if (!membership.stripePriceId) {
      throw new Error("Membership has no Stripe price ID (legacy membership)");
    }

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      // https://docs.stripe.com/api/customers/create
      stripeCustomerId = await createStripeCustomer(userId, user.email, formatUserName(user));
    }

    const memberId = crypto.randomUUID();

    // https://docs.stripe.com/api/checkout/sessions/create
    const session = await createCheckoutSessionWithRetry(
      userId,
      user.email,
      formatUserName(user),
      stripeCustomerId,
      membership.stripePriceId,
      locale,
      memberId,
    );
    await db.insert(table.member).values({
      id: memberId,
      userId: userId,
      membershipId: membershipId,
      stripeSessionId: session.id,
      status: "awaiting_payment",
      description: description ?? null,
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
        membership: {
          with: { membershipType: true },
        },
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

    if (!member.membership.membershipType.purchasable) {
      throw new Error("This membership type is not available for purchase");
    }

    if (member.userId) span.setAttribute("user.id", member.userId);
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
    if (!user) {
      throw new Error("Member has no associated user account");
    }

    let stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) {
      stripeCustomerId = await createStripeCustomer(user.id, user.email, formatUserName(user));
    }

    const session = await createCheckoutSessionWithRetry(
      user.id,
      user.email,
      formatUserName(user),
      stripeCustomerId,
      membership.stripePriceId,
      locale,
      memberId,
    );

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
    let newStatus: "active" | "awaiting_approval" | null = null;
    await db.transaction(async (tx) => {
      const member = await tx.query.member.findFirst({
        where: eq(table.member.id, memberId),
        with: { membership: true },
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

      const eligible = member.userId ? await checkAutoApprovalEligibility(tx, member.userId, member.membership) : false;
      newStatus = eligible ? "active" : "awaiting_approval";

      await tx.update(table.member).set({ status: newStatus }).where(eq(table.member.id, member.id));

      if (eligible) {
        const action: AuditAction = "member.auto_approve";
        await tx.insert(table.auditLog).values({
          id: encodeBase32LowerCase(crypto.getRandomValues(new Uint8Array(16))),
          userId: null,
          action,
          targetType: "member",
          targetId: member.id,
          metadata: {
            reason: "renewal",
            membershipTypeId: member.membership.membershipTypeId,
            userId: member.userId,
          },
          ipAddress: null,
          userAgent: null,
        });
      }

      span.setAttribute("member.id", member.id);
      if (member.userId) span.setAttribute("user.id", member.userId);

      logger.info("stripe.session.fulfilled", {
        "stripe.session.id": sessionId,
        "member.id": member.id,
        "user.id": member.userId ?? "unknown",
        status: newStatus,
        auto_approved: eligible,
      });
    });

    // Send appropriate email based on the status that was set
    // NOTE: Email sending is synchronous and adds ~200-500ms latency to webhook response.
    // This is acceptable because:
    // 1. Stripe retries failed webhooks automatically
    // 2. Phase 1 prioritizes simplicity over background job complexity
    // 3. Email failures are caught and logged without failing the transaction
    if (newStatus) {
      try {
        const memberWithDetails = await db.query.member.findFirst({
          where: eq(table.member.id, memberId),
          with: {
            user: true,
            membership: {
              with: { membershipType: true },
            },
          },
        });

        if (!memberWithDetails?.user) {
          return;
        }

        const userLocale = getUserLocale(memberWithDetails.user);

        if (newStatus === "active") {
          // Auto-approved (renewal): send membership renewed email immediately
          await sendMemberEmail({
            recipientEmail: memberWithDetails.user.email,
            emailType: "membership_renewed",
            metadata: {
              firstName: getDisplayFirstName(memberWithDetails.user),
              membershipName: getMembershipName(memberWithDetails.membership, userLocale),
              startDate: memberWithDetails.membership.startTime,
              endDate: memberWithDetails.membership.endTime,
            },
            locale: userLocale,
          });
        } else if (newStatus === "awaiting_approval" && session.amount_total && session.currency) {
          // Requires board approval: send payment success email
          await sendMemberEmail({
            recipientEmail: memberWithDetails.user.email,
            emailType: "payment_success",
            metadata: {
              membershipName: getMembershipName(memberWithDetails.membership, userLocale),
              amount: session.amount_total,
              currency: session.currency,
            },
            locale: userLocale,
          });
        }
      } catch (emailError) {
        // Log but don't fail the fulfillment if email fails
        logger.error("stripe.session.fulfill_email_failed", emailError, {
          "stripe.session.id": sessionId,
          "member.id": memberId,
        });
      }
    }
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
      await tx.update(table.member).set({ status: "rejected" }).where(eq(table.member.id, member.id));

      span.setAttribute("member.id", member.id);
      if (member.userId) span.setAttribute("user.id", member.userId);

      logger.info("stripe.session.cancelled", {
        "stripe.session.id": sessionId,
        "member.id": member.id,
        "user.id": member.userId ?? "unknown",
      });
    });
  });
}
