import { stripe } from "$lib/server/payment";
import * as table from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { env } from "$lib/server/env";
import type { Locale } from "$lib/i18n/routing";
import Stripe from "stripe";
import { sendMemberEmail } from "$lib/server/emails";
import { getUserLocale } from "$lib/server/utils/user";
import { formatFullName } from "$lib/utils";

function isNoSuchCustomerError(error: unknown): error is Stripe.errors.StripeInvalidRequestError {
  return error instanceof Stripe.errors.StripeInvalidRequestError && error.message.includes("No such customer");
}

async function createStripeCustomer(userId: string, email: string, name: string): Promise<string> {
  const customer = await stripe.customers.create({ email, name, metadata: { userId } });
  await db.update(table.user).set({ stripeCustomerId: customer.id }).where(eq(table.user.id, userId));
  return customer.id;
}

async function handleInvalidCustomerId(userId: string, invalidCustomerId: string): Promise<void> {
  console.error(`[Stripe Customer Recovery] Removing invalid customer ${invalidCustomerId} for user ${userId}`);
  await db.update(table.user).set({ stripeCustomerId: null }).where(eq(table.user.id, userId));
}

async function createCheckoutSessionWithRetry(input: {
  userId: string;
  email: string;
  name: string;
  customerId: string;
  stripePriceId: string;
  locale: Locale;
  memberId: string;
  paymentId: string;
}) {
  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    line_items: [{ price: input.stripePriceId, quantity: 1 }],
    mode: "payment",
    customer: input.customerId,
    success_url: `${env.PUBLIC_URL}/${input.locale}?stripeStatus=success`,
    cancel_url: `${env.PUBLIC_URL}/${input.locale}?stripeStatus=cancel`,
    metadata: { memberId: input.memberId, paymentId: input.paymentId },
  };

  try {
    return await stripe.checkout.sessions.create(sessionConfig);
  } catch (error) {
    if (!isNoSuchCustomerError(error)) throw error;
    await handleInvalidCustomerId(input.userId, input.customerId);
    sessionConfig.customer = await createStripeCustomer(input.userId, input.email, input.name);
    return await stripe.checkout.sessions.create(sessionConfig);
  }
}

async function preparePurchase(userId: string, feePeriodId: string, applicationMotive: string | null) {
  return db.transaction(async (tx) => {
    const feePeriod = await tx.query.membershipFeePeriod.findFirst({
      where: { id: feePeriodId },
      with: { membershipType: true },
    });
    const user = await tx.query.user.findFirst({ where: { id: userId } });

    if (!feePeriod || !user) throw new Error("Membership fee period or user not found");
    if (!feePeriod.publishedAt || !feePeriod.membershipType.purchasable) {
      throw new Error("This membership type is not available for purchase");
    }

    await tx.execute(sql`SELECT "id" FROM "user" WHERE "id" = ${userId} FOR UPDATE`);
    let member = await tx.query.member.findFirst({
      where: { userId },
      with: { obligations: { with: { feePeriod: true, payments: true } } },
    });

    if (!member) {
      const memberId = crypto.randomUUID();
      await tx.insert(table.member).values({
        id: memberId,
        userId,
        status: "awaiting_payment",
        pendingMembershipTypeId: feePeriod.membershipTypeId,
        applicationMotive,
      });
      member = await tx.query.member.findFirst({
        where: { id: memberId },
        with: { obligations: { with: { feePeriod: true, payments: true } } },
      });
    }

    if (!member) throw new Error("Could not initialize member");

    let kind: "application" | "renewal" | "type_change";
    let replacedObligationId: string | null = null;
    if (member.status === "active") {
      if (member.pendingMembershipTypeId) {
        throw new Error("A membership type change is already awaiting a board decision");
      }
      kind = member.membershipTypeId === feePeriod.membershipTypeId ? "renewal" : "type_change";
      if (kind === "type_change") {
        const replacedObligation = member.obligations.find(
          (obligation) =>
            obligation.disposition === "required" &&
            obligation.feePeriod.membershipTypeId === member.membershipTypeId &&
            obligation.feePeriod.startDate === feePeriod.startDate &&
            obligation.feePeriod.endDate === feePeriod.endDate,
        );
        const replacedObligationIsSettled = replacedObligation?.payments.some(
          (payment) => payment.status === "succeeded" && !payment.refundConfirmedAt && !payment.invalidatedAt,
        );
        if (!replacedObligation || replacedObligationIsSettled) {
          throw new Error("A self-service type change is only available instead of an unpaid renewal");
        }
        replacedObligationId = replacedObligation.id;
      }
    } else if (member.status === "awaiting_approval") {
      throw new Error("The membership application is already awaiting approval");
    } else {
      kind = "application";
      await tx
        .update(table.member)
        .set({
          status: "awaiting_payment",
          pendingMembershipTypeId: feePeriod.membershipTypeId,
          applicationMotive,
        })
        .where(eq(table.member.id, member.id));
    }

    if (!feePeriod.membershipType.requiresPayment) {
      return { user, member, feePeriod, kind, obligation: null, replacedObligationId };
    }
    if (!feePeriod.stripePriceId) {
      throw new Error("Membership fee period has incomplete payment configuration");
    }

    const obligationId = crypto.randomUUID();
    await tx
      .insert(table.membershipObligation)
      .values({
        id: obligationId,
        memberId: member.id,
        membershipFeePeriodId: feePeriod.id,
        kind,
      })
      .onConflictDoNothing({
        target: [table.membershipObligation.memberId, table.membershipObligation.membershipFeePeriodId],
      });

    const obligation = await tx.query.membershipObligation.findFirst({
      where: { memberId: member.id, membershipFeePeriodId: feePeriod.id },
      with: { payments: true },
    });
    if (!obligation) throw new Error("Could not initialize membership obligation");
    if (obligation.disposition === "waived") throw new Error("This membership fee has already been waived");

    if (obligation.disposition === "cancelled") {
      await tx
        .update(table.membershipObligation)
        .set({ disposition: "required", dispositionReason: null, kind })
        .where(eq(table.membershipObligation.id, obligation.id));
      obligation.disposition = "required";
      obligation.dispositionReason = null;
    }

    const settled = obligation.payments.some(
      (payment) => payment.status === "succeeded" && !payment.refundConfirmedAt && !payment.invalidatedAt,
    );
    if (settled) throw new Error("This membership fee has already been paid");

    return { user, member, feePeriod, kind, obligation, replacedObligationId };
  });
}

async function appendSubmissionForFreePeriod(input: Awaited<ReturnType<typeof preparePurchase>>) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "member" WHERE "id" = ${input.member.id} FOR UPDATE`);
    const member = await tx.query.member.findFirst({ where: { id: input.member.id } });
    if (!member) throw new Error("Member not found");

    if (input.kind === "renewal") return;

    const eventType = input.kind === "application" ? "application_submitted" : "type_change_requested";
    const data =
      input.kind === "application"
        ? { membershipTypeId: input.feePeriod.membershipTypeId }
        : {
            fromMembershipTypeId: member.membershipTypeId ?? "",
            toMembershipTypeId: input.feePeriod.membershipTypeId,
          };

    await tx.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId: member.id,
      eventType,
      effectiveAt: new Date(),
      source: "system",
      certainty: "confirmed",
      membershipFeePeriodId: input.feePeriod.id,
      data,
    });

    await tx
      .update(table.member)
      .set(
        input.kind === "application"
          ? { status: "awaiting_approval", pendingMembershipTypeId: input.feePeriod.membershipTypeId }
          : { pendingMembershipTypeId: input.feePeriod.membershipTypeId },
      )
      .where(eq(table.member.id, member.id));

    if (input.kind === "type_change" && input.replacedObligationId) {
      await tx
        .update(table.membershipObligation)
        .set({ disposition: "cancelled", dispositionReason: "pending_type_change" })
        .where(
          and(
            eq(table.membershipObligation.id, input.replacedObligationId),
            eq(table.membershipObligation.disposition, "required"),
          ),
        );
    }
  });
}

async function getReusableCheckoutUrl(stripeSessionId: string): Promise<string | null> {
  try {
    const existingSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
    if (existingSession.status === "open" && existingSession.url) return existingSession.url;
    if (existingSession.payment_status === "paid") {
      throw new Error("Your payment is being processed. Your membership will be activated shortly.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Your payment is being processed")) throw error;
    console.warn("Failed to retrieve existing Stripe session, creating new:", error);
  }
  return null;
}

async function createPaymentAttempt(input: Awaited<ReturnType<typeof preparePurchase>>, locale: Locale) {
  if (!input.obligation || !input.feePeriod.stripePriceId) {
    throw new Error("Membership obligation has no Stripe price");
  }

  const existingAttempt = input.obligation.payments.find((payment) => payment.status === "pending");
  if (existingAttempt?.stripeSessionId) {
    const url = await getReusableCheckoutUrl(existingAttempt.stripeSessionId);
    if (url) return { url, isNew: false };
    await db.update(table.payment).set({ status: "expired" }).where(eq(table.payment.id, existingAttempt.id));
  } else if (existingAttempt) {
    throw new Error("A payment attempt is already being initialized");
  }

  const paymentId = crypto.randomUUID();
  await db.insert(table.payment).values({
    id: paymentId,
    memberId: input.member.id,
    membershipFeePeriodId: input.feePeriod.id,
    obligationId: input.obligation.id,
    source: "stripe",
    status: "pending",
    amount: null,
    currency: null,
  });

  try {
    const customerId =
      input.user.stripeCustomerId ??
      (await createStripeCustomer(input.user.id, input.user.email, formatFullName(input.user)));
    const session = await createCheckoutSessionWithRetry({
      userId: input.user.id,
      email: input.user.email,
      name: formatFullName(input.user),
      customerId,
      stripePriceId: input.feePeriod.stripePriceId,
      locale,
      memberId: input.member.id,
      paymentId,
    });
    if (!session.url) throw new Error("Stripe checkout session was created without a URL");
    await db.update(table.payment).set({ stripeSessionId: session.id }).where(eq(table.payment.id, paymentId));
    return { url: session.url, isNew: true };
  } catch (error) {
    await db.update(table.payment).set({ status: "failed" }).where(eq(table.payment.id, paymentId));
    throw error;
  }
}

export async function createSession(userId: string, feePeriodId: string, locale: Locale, description?: string | null) {
  const purchase = await preparePurchase(userId, feePeriodId, description ?? null);
  if (!purchase.obligation) {
    await appendSubmissionForFreePeriod(purchase);
    return { url: `${env.PUBLIC_URL}/${locale}?applicationStatus=submitted`, isNew: true };
  }
  return createPaymentAttempt(purchase, locale);
}

export async function resumeOrCreateSession(memberId: string, locale: Locale) {
  const member = await db.query.member.findFirst({
    where: { id: memberId },
    with: {
      obligations: {
        where: { disposition: "required" },
        with: { feePeriod: true },
        orderBy: { createdAt: "desc" },
        limit: 1,
      },
    },
  });
  const obligation = member?.obligations[0];
  if (!member?.userId || !obligation) throw new Error("No payable membership obligation was found");
  const purchase = await preparePurchase(member.userId, obligation.feePeriod.id, member.applicationMotive);
  return createPaymentAttempt(purchase, locale);
}

export async function fulfillSession(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "unpaid") return;

  const paymentId =
    session.metadata?.paymentId ??
    (
      await db.query.payment.findFirst({
        where: { stripeSessionId: sessionId },
        columns: { id: true },
      })
    )?.id;
  if (!paymentId) {
    console.error(`[fulfillSession] No paymentId in session metadata for session ${sessionId}`);
    return;
  }

  let notification: { memberId: string; kind: "application" | "renewal" | "type_change" } | null = null;
  await db.transaction(async (tx) => {
    const locator = await tx.query.payment.findFirst({
      where: { id: paymentId },
      columns: { memberId: true, obligationId: true },
    });
    if (!locator?.obligationId) return;

    await tx.execute(sql`SELECT "id" FROM "member" WHERE "id" = ${locator.memberId} FOR UPDATE`);
    await tx.execute(sql`SELECT "id" FROM "membership_obligation" WHERE "id" = ${locator.obligationId} FOR UPDATE`);
    await tx.execute(sql`SELECT "id" FROM "payment" WHERE "id" = ${paymentId} FOR UPDATE`);
    const payment = await tx.query.payment.findFirst({
      where: { id: paymentId },
      with: {
        obligation: { with: { feePeriod: true } },
        member: { with: { obligations: { with: { feePeriod: true } } } },
      },
    });
    if (!payment?.obligation || payment.status === "succeeded") return;

    const stripePaymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
    const paidAt = new Date();
    const siblingSuccess = await tx.query.payment.findFirst({
      where: {
        obligationId: payment.obligation.id,
        id: { ne: payment.id },
        status: "succeeded",
        refundConfirmedAt: { isNull: true },
        invalidatedAt: { isNull: true },
      },
    });
    const obsolete = payment.obligation.disposition !== "required";

    await tx
      .update(table.payment)
      .set({
        status: "succeeded",
        paidAt,
        amount: session.amount_total ?? payment.amount,
        currency: session.currency ?? payment.currency,
        stripePaymentIntentId,
        refundRequiredAt: obsolete || siblingSuccess ? paidAt : null,
        refundReason: obsolete ? "obsolete_obligation" : siblingSuccess ? "duplicate_payment" : null,
      })
      .where(eq(table.payment.id, payment.id));

    if (obsolete || siblingSuccess) return;

    const member = payment.member;
    const feePeriod = payment.obligation.feePeriod;
    if (payment.obligation.kind === "application") {
      if (member.status !== "awaiting_payment" || member.pendingMembershipTypeId !== feePeriod.membershipTypeId) {
        await tx
          .update(table.payment)
          .set({ refundRequiredAt: paidAt, refundReason: "obsolete_obligation" })
          .where(eq(table.payment.id, payment.id));
        return;
      }
      await tx.update(table.member).set({ status: "awaiting_approval" }).where(eq(table.member.id, member.id));
      await tx.insert(table.membershipEvent).values({
        id: `stripe-submission-${session.id}`,
        memberId: member.id,
        eventType: "application_submitted",
        effectiveAt: paidAt,
        source: "system",
        certainty: "confirmed",
        membershipFeePeriodId: feePeriod.id,
        data: { membershipTypeId: feePeriod.membershipTypeId },
      });
    } else if (payment.obligation.kind === "type_change") {
      if (member.status !== "active" || !member.membershipTypeId) {
        await tx
          .update(table.payment)
          .set({ refundRequiredAt: paidAt, refundReason: "obsolete_obligation" })
          .where(eq(table.payment.id, payment.id));
        return;
      }
      await tx
        .update(table.member)
        .set({ pendingMembershipTypeId: feePeriod.membershipTypeId })
        .where(eq(table.member.id, member.id));
      await tx.insert(table.membershipEvent).values({
        id: `stripe-type-change-${session.id}`,
        memberId: member.id,
        eventType: "type_change_requested",
        effectiveAt: paidAt,
        source: "system",
        certainty: "confirmed",
        membershipFeePeriodId: feePeriod.id,
        data: {
          fromMembershipTypeId: member.membershipTypeId,
          toMembershipTypeId: feePeriod.membershipTypeId,
        },
      });
      const replacedObligation = member.obligations.find(
        (obligation) =>
          obligation.id !== payment.obligation?.id &&
          obligation.disposition === "required" &&
          obligation.feePeriod.membershipTypeId === member.membershipTypeId &&
          obligation.feePeriod.startDate === feePeriod.startDate &&
          obligation.feePeriod.endDate === feePeriod.endDate,
      );
      if (replacedObligation) {
        await tx
          .update(table.membershipObligation)
          .set({ disposition: "cancelled", dispositionReason: "pending_type_change" })
          .where(
            and(
              eq(table.membershipObligation.id, replacedObligation.id),
              eq(table.membershipObligation.disposition, "required"),
            ),
          );
      }
    }

    notification = { memberId: member.id, kind: payment.obligation.kind };
  });

  if (notification) await sendPaymentNotification(notification, session);
}

async function sendPaymentNotification(
  notification: { memberId: string; kind: "application" | "renewal" | "type_change" },
  session: Stripe.Checkout.Session,
) {
  try {
    const member = await db.query.member.findFirst({
      where: { id: notification.memberId },
      with: { user: true, membershipType: true, pendingMembershipType: true },
    });
    if (!member?.user) return;
    const membershipType = member.pendingMembershipType ?? member.membershipType;
    if (!membershipType) return;
    const locale = getUserLocale(member.user);
    await sendMemberEmail({
      recipientEmail: member.user.email,
      emailType: "payment_success",
      metadata: {
        membershipName: membershipType.name[locale],
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "eur",
      },
      locale,
    });
  } catch (error) {
    console.error("[fulfillSession] Failed to send email:", error);
  }
}

export async function cancelSession(sessionId: string) {
  await db
    .update(table.payment)
    .set({ status: "expired" })
    .where(
      and(
        eq(table.payment.stripeSessionId, sessionId),
        eq(table.payment.status, "pending"),
        isNull(table.payment.paidAt),
      ),
    );
}
