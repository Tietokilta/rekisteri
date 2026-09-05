import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockMember(tx: Transaction, memberId: string) {
  await tx.execute(sql`SELECT "id" FROM "member" WHERE "id" = ${memberId} FOR UPDATE`);
  return tx.query.member.findFirst({
    where: { id: memberId },
    with: {
      membershipType: true,
      pendingMembershipType: true,
      obligations: { with: { feePeriod: true, payments: true } },
      payments: { with: { feePeriod: true } },
      events: { with: { feePeriod: true }, orderBy: { effectiveAt: "desc", recordedAt: "desc" } },
    },
  });
}

function latestPendingFeePeriodId(
  member: NonNullable<Awaited<ReturnType<typeof lockMember>>>,
  pendingMembershipTypeId: string,
) {
  const obligationPeriodId = member.obligations
    .filter((obligation) => obligation.feePeriod.membershipTypeId === pendingMembershipTypeId)
    .toSorted((left, right) => right.feePeriod.startDate.localeCompare(left.feePeriod.startDate))[0]?.feePeriod.id;
  if (obligationPeriodId) return obligationPeriodId;

  return (
    member.events.find(
      (event) =>
        event.membershipFeePeriodId &&
        ((event.eventType === "application_submitted" &&
          "membershipTypeId" in event.data &&
          event.data.membershipTypeId === pendingMembershipTypeId) ||
          (event.eventType === "type_change_requested" &&
            "toMembershipTypeId" in event.data &&
            event.data.toMembershipTypeId === pendingMembershipTypeId)),
    )?.membershipFeePeriodId ?? undefined
  );
}

function paymentSettlesObligation(payment: typeof table.payment.$inferSelect) {
  return payment.status === "succeeded" && !payment.refundConfirmedAt && !payment.invalidatedAt;
}

function assertPendingDecisionIsPayable(
  member: NonNullable<Awaited<ReturnType<typeof lockMember>>>,
  pendingMembershipTypeId: string,
  feePeriodId: string | undefined,
) {
  if (!feePeriodId) throw new Error("pending_fee_period_not_found");
  const feePeriod =
    member.obligations.find((obligation) => obligation.membershipFeePeriodId === feePeriodId)?.feePeriod ??
    member.events.find((event) => event.membershipFeePeriodId === feePeriodId)?.feePeriod;
  if (!feePeriod || feePeriod.membershipTypeId !== pendingMembershipTypeId) {
    throw new Error("pending_fee_period_not_found");
  }
  if (!member.pendingMembershipType?.requiresPayment) return feePeriod;
  if (!feePeriod.stripePriceId) throw new Error("pending_fee_period_not_payable");

  const obligation = member.obligations.find(
    (candidate) => candidate.membershipFeePeriodId === feePeriodId && candidate.memberId === member.id,
  );
  const isWaived = obligation?.disposition === "waived";
  const isSettled = obligation?.disposition === "required" && obligation.payments.some(paymentSettlesObligation);
  if (!isWaived && !isSettled) throw new Error("pending_obligation_not_settled");
  return feePeriod;
}

async function issuePublishedCatchupObligations(
  tx: Transaction,
  memberId: string,
  membershipTypeId: string,
  afterStartDate: string,
) {
  const laterPeriods = await tx.query.membershipFeePeriod.findMany({
    where: {
      membershipTypeId,
      startDate: { gt: afterStartDate },
      publishedAt: { isNotNull: true },
      stripePriceId: { isNotNull: true },
    },
    columns: { id: true },
  });
  if (laterPeriods.length === 0) return;
  await tx
    .insert(table.membershipObligation)
    .values(
      laterPeriods.map((period) => ({
        id: crypto.randomUUID(),
        memberId,
        membershipFeePeriodId: period.id,
        kind: "renewal" as const,
      })),
    )
    .onConflictDoNothing({
      target: [table.membershipObligation.memberId, table.membershipObligation.membershipFeePeriodId],
    });
}

export async function approveMembershipInTransaction(tx: Transaction, memberId: string, actorUserId: string) {
  const member = await lockMember(tx, memberId);
  if (!member?.pendingMembershipTypeId) throw new Error("not_awaiting_approval");
  const now = new Date();
  const feePeriodId = latestPendingFeePeriodId(member, member.pendingMembershipTypeId);
  const feePeriod = assertPendingDecisionIsPayable(member, member.pendingMembershipTypeId, feePeriodId);

  if (member.status === "active") {
    if (!member.membershipTypeId) throw new Error("active_member_has_no_type");
    const previousMembershipTypeId = member.membershipTypeId;
    await tx
      .update(table.member)
      .set({ membershipTypeId: member.pendingMembershipTypeId, pendingMembershipTypeId: null })
      .where(
        and(
          eq(table.member.id, member.id),
          eq(table.member.status, "active"),
          eq(table.member.membershipTypeId, previousMembershipTypeId),
          eq(table.member.pendingMembershipTypeId, member.pendingMembershipTypeId),
        ),
      );
    await tx.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId,
      eventType: "type_changed",
      effectiveAt: now,
      source: "admin",
      certainty: "confirmed",
      actorUserId,
      membershipFeePeriodId: feePeriodId,
      data: {
        fromMembershipTypeId: previousMembershipTypeId,
        toMembershipTypeId: member.pendingMembershipTypeId,
      },
    });
    await tx
      .update(table.membershipObligation)
      .set({ dispositionReason: "replaced_by_type_change" })
      .where(
        and(
          eq(table.membershipObligation.memberId, member.id),
          eq(table.membershipObligation.disposition, "cancelled"),
          eq(table.membershipObligation.dispositionReason, "pending_type_change"),
        ),
      );
    return { kind: "type_change" as const, membershipType: member.pendingMembershipType };
  }

  if (member.status !== "awaiting_approval") throw new Error("not_awaiting_approval");
  const isRejoining = member.membershipTypeId !== null;
  await tx
    .update(table.member)
    .set({
      status: "active",
      membershipTypeId: member.pendingMembershipTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: now,
      currentMembershipEndedAt: null,
    })
    .where(
      and(
        eq(table.member.id, member.id),
        eq(table.member.status, "awaiting_approval"),
        eq(table.member.pendingMembershipTypeId, member.pendingMembershipTypeId),
      ),
    );
  await tx.insert(table.membershipEvent).values({
    id: crypto.randomUUID(),
    memberId,
    eventType: "application_approved",
    effectiveAt: now,
    source: "admin",
    certainty: "confirmed",
    actorUserId,
    membershipFeePeriodId: feePeriodId,
    data: { membershipTypeId: member.pendingMembershipTypeId },
  });
  await issuePublishedCatchupObligations(tx, member.id, member.pendingMembershipTypeId, feePeriod.startDate);
  return {
    kind: isRejoining ? ("rejoin" as const) : ("application" as const),
    membershipType: member.pendingMembershipType,
  };
}

export async function approveMembership(memberId: string, actorUserId: string) {
  return db.transaction((tx) => approveMembershipInTransaction(tx, memberId, actorUserId));
}

export async function rejectMembership(memberId: string, actorUserId: string, reason?: string) {
  return db.transaction(async (tx) => {
    const member = await lockMember(tx, memberId);
    if (!member?.pendingMembershipTypeId) throw new Error("not_awaiting_approval");
    if (member.status !== "awaiting_approval" && member.status !== "active") {
      throw new Error("cannot_reject");
    }
    const now = new Date();
    const targetTypeId = member.pendingMembershipTypeId;
    const feePeriodId = latestPendingFeePeriodId(member, targetTypeId);
    const isTypeChange = member.status === "active";

    await tx
      .update(table.member)
      .set({
        status: isTypeChange ? "active" : member.membershipTypeId ? "ended" : "rejected",
        pendingMembershipTypeId: null,
      })
      .where(and(eq(table.member.id, member.id), eq(table.member.status, member.status)));

    const targetObligationIds = member.obligations
      .filter((obligation) => obligation.feePeriod.membershipTypeId === targetTypeId)
      .map((obligation) => obligation.id);
    if (targetObligationIds.length > 0) {
      await tx
        .update(table.membershipObligation)
        .set({
          disposition: "cancelled",
          dispositionReason: isTypeChange ? "type_change_rejected" : "application_rejected",
        })
        .where(inArray(table.membershipObligation.id, targetObligationIds));
      await tx
        .update(table.payment)
        .set({ refundRequiredAt: now, refundReason: isTypeChange ? "type_change_rejected" : "application_rejected" })
        .where(and(inArray(table.payment.obligationId, targetObligationIds), eq(table.payment.status, "succeeded")));
    }

    if (isTypeChange) {
      await tx.insert(table.membershipEvent).values({
        id: crypto.randomUUID(),
        memberId,
        eventType: "type_change_rejected",
        effectiveAt: now,
        source: "admin",
        certainty: "confirmed",
        actorUserId,
        membershipFeePeriodId: feePeriodId,
        data: { fromMembershipTypeId: member.membershipTypeId ?? "", toMembershipTypeId: targetTypeId, reason },
      });
      await tx
        .update(table.membershipObligation)
        .set({ disposition: "required", dispositionReason: null })
        .where(
          and(
            eq(table.membershipObligation.memberId, member.id),
            eq(table.membershipObligation.dispositionReason, "pending_type_change"),
          ),
        );
    } else {
      await tx.insert(table.membershipEvent).values({
        id: crypto.randomUUID(),
        memberId,
        eventType: "application_rejected",
        effectiveAt: now,
        source: "admin",
        certainty: "confirmed",
        actorUserId,
        membershipFeePeriodId: feePeriodId,
        data: { membershipTypeId: targetTypeId, reason },
      });
    }
  });
}

function todayInHelsinki(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function endMembershipInTransaction(
  tx: Transaction,
  memberId: string,
  actorUserId: string,
  eventType: "resigned_voluntarily" | "deemed_resigned_nonpayment" | "expelled",
  reason?: string,
  requireActionableNonPayment = false,
) {
  const member = await lockMember(tx, memberId);
  if (!member || member.status !== "active") throw new Error("cannot_end");
  const now = new Date();
  if (requireActionableNonPayment) {
    const today = todayInHelsinki(now);
    const hasActionableUnpaidObligation = member.obligations.some(
      (obligation) =>
        obligation.disposition === "required" &&
        obligation.feePeriod.nonPaymentActionAt <= today &&
        !obligation.payments.some(paymentSettlesObligation),
    );
    if (!hasActionableUnpaidObligation) throw new Error("nonpayment_not_actionable");
  }
  await tx
    .update(table.member)
    .set({ status: "ended", pendingMembershipTypeId: null, currentMembershipEndedAt: now })
    .where(and(eq(table.member.id, member.id), eq(table.member.status, "active")));
  await tx.insert(table.membershipEvent).values({
    id: crypto.randomUUID(),
    memberId,
    eventType,
    effectiveAt: now,
    source: "admin",
    certainty: "confirmed",
    actorUserId,
    data: { reason },
  });
  await tx
    .update(table.membershipObligation)
    .set({ disposition: "cancelled", dispositionReason: "membership_ended" })
    .where(
      and(eq(table.membershipObligation.memberId, member.id), eq(table.membershipObligation.disposition, "required")),
    );
}

export async function endMembership(
  memberId: string,
  actorUserId: string,
  eventType: "resigned_voluntarily" | "deemed_resigned_nonpayment" | "expelled",
  reason?: string,
) {
  return db.transaction((tx) => endMembershipInTransaction(tx, memberId, actorUserId, eventType, reason));
}

export async function endMembershipForNonPayment(memberId: string, actorUserId: string, reason?: string) {
  return db.transaction((tx) =>
    endMembershipInTransaction(tx, memberId, actorUserId, "deemed_resigned_nonpayment", reason, true),
  );
}

export async function correctMembershipEnding(memberId: string, actorUserId: string, reason: string) {
  return db.transaction(async (tx) => {
    const member = await lockMember(tx, memberId);
    if (!member || member.status !== "ended" || !member.membershipTypeId || !member.currentMembershipStartedAt) {
      throw new Error("cannot_correct_ending");
    }
    const endingEvent = member.events.find((event) =>
      ["resigned_voluntarily", "deemed_resigned_nonpayment", "expelled", "legacy_resignation_inferred"].includes(
        event.eventType,
      ),
    );
    if (!endingEvent) throw new Error("ending_event_not_found");
    const now = new Date();
    await tx
      .update(table.member)
      .set({ status: "active", currentMembershipEndedAt: null })
      .where(and(eq(table.member.id, member.id), eq(table.member.status, "ended")));
    await tx.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId,
      eventType: "membership_decision_corrected",
      effectiveAt: now,
      source: "admin",
      certainty: "confirmed",
      actorUserId,
      relatedEventId: endingEvent.id,
      data: {
        reason,
        snapshot: {
          status: "active",
          membershipTypeId: member.membershipTypeId,
          pendingMembershipTypeId: null,
          currentMembershipStartedAt: member.currentMembershipStartedAt,
          currentMembershipEndedAt: null,
        },
      },
    });
  });
}

export async function correctMembershipType(
  memberId: string,
  targetFeePeriodId: string,
  actorUserId: string,
  assertPricesEquivalent: (sourceStripePriceId: string, targetStripePriceId: string) => Promise<void>,
) {
  const preflightMember = await db.query.member.findFirst({
    where: { id: memberId },
    with: { payments: { with: { feePeriod: true } } },
  });
  const preflightTarget = await db.query.membershipFeePeriod.findFirst({ where: { id: targetFeePeriodId } });
  if (!preflightMember || !preflightTarget) throw new Error("cannot_correct_type");
  const preflightTypeId =
    preflightMember.status === "active"
      ? preflightMember.membershipTypeId
      : preflightMember.status === "awaiting_approval"
        ? preflightMember.pendingMembershipTypeId
        : null;
  const preflightPayment = preflightMember.payments.find(
    (payment) =>
      payment.feePeriod.membershipTypeId === preflightTypeId &&
      payment.feePeriod.startDate === preflightTarget.startDate &&
      payment.feePeriod.endDate === preflightTarget.endDate,
  );
  const sourceStripePriceId = preflightPayment?.feePeriod.stripePriceId;
  const targetStripePriceId = preflightTarget.stripePriceId;
  if (!sourceStripePriceId || !targetStripePriceId) throw new Error("price_mismatch");

  // Stripe is deliberately consulted before opening the write transaction.
  await assertPricesEquivalent(sourceStripePriceId, targetStripePriceId);

  return db.transaction(async (tx) => {
    const member = await lockMember(tx, memberId);
    if (!member || (member.status !== "active" && member.status !== "awaiting_approval")) {
      throw new Error("cannot_correct_type");
    }
    const target = await tx.query.membershipFeePeriod.findFirst({ where: { id: targetFeePeriodId } });
    if (!target) throw new Error("target_period_not_found");
    const currentTypeId = member.status === "active" ? member.membershipTypeId : member.pendingMembershipTypeId;
    if (!currentTypeId || currentTypeId === target.membershipTypeId) throw new Error("membership_type_unchanged");

    const sourcePayment = member.payments.find(
      (payment) =>
        payment.feePeriod.membershipTypeId === currentTypeId &&
        payment.feePeriod.startDate === target.startDate &&
        payment.feePeriod.endDate === target.endDate,
    );
    if (!sourcePayment) throw new Error("period_mismatch");
    if (sourcePayment.feePeriod.stripePriceId !== sourceStripePriceId || target.stripePriceId !== targetStripePriceId) {
      throw new Error("correction_conflict");
    }

    const sourceObligation = sourcePayment.obligationId
      ? member.obligations.find((obligation) => obligation.id === sourcePayment.obligationId)
      : null;
    let targetObligationId: string | null = null;
    if (sourceObligation) {
      targetObligationId = crypto.randomUUID();
      await tx.insert(table.membershipObligation).values({
        id: targetObligationId,
        memberId,
        membershipFeePeriodId: target.id,
        kind: sourceObligation.kind,
        disposition: sourceObligation.disposition,
        dispositionReason: sourceObligation.dispositionReason,
      });
    }

    await tx
      .update(table.payment)
      .set({ membershipFeePeriodId: target.id, obligationId: targetObligationId })
      .where(eq(table.payment.id, sourcePayment.id));
    if (sourceObligation) {
      await tx.delete(table.membershipObligation).where(eq(table.membershipObligation.id, sourceObligation.id));
    }

    const relatedEvent = member.events.find((event) => {
      if ("membershipTypeId" in event.data) return event.data.membershipTypeId === currentTypeId;
      if ("toMembershipTypeId" in event.data) return event.data.toMembershipTypeId === currentTypeId;
      return false;
    });
    if (!relatedEvent) throw new Error("type_event_not_found");

    const correction = {
      previousFeePeriodId: sourcePayment.membershipFeePeriodId,
      previousMembershipTypeId: currentTypeId,
      previousStripePriceId: sourceStripePriceId,
      targetFeePeriodId: target.id,
      targetMembershipTypeId: target.membershipTypeId,
      targetStripePriceId,
      previousStatus: member.status,
    };

    if (member.status === "awaiting_approval") {
      await tx
        .update(table.member)
        .set({ pendingMembershipTypeId: target.membershipTypeId })
        .where(
          and(
            eq(table.member.id, member.id),
            eq(table.member.status, "awaiting_approval"),
            eq(table.member.pendingMembershipTypeId, currentTypeId),
          ),
        );
      await tx.insert(table.membershipEvent).values({
        id: crypto.randomUUID(),
        memberId,
        eventType: "membership_decision_corrected",
        effectiveAt: new Date(),
        source: "admin",
        certainty: "confirmed",
        actorUserId,
        relatedEventId: relatedEvent.id,
        membershipFeePeriodId: target.id,
        data: {
          reason: "Corrected an equal-priced membership type purchase",
          snapshot: {
            status: "awaiting_approval",
            membershipTypeId: member.membershipTypeId,
            pendingMembershipTypeId: target.membershipTypeId,
            currentMembershipStartedAt: member.currentMembershipStartedAt,
            currentMembershipEndedAt: member.currentMembershipEndedAt,
          },
        },
      });
      return correction;
    }

    if (!member.currentMembershipStartedAt) throw new Error("type_event_not_found");
    await tx
      .update(table.member)
      .set({ membershipTypeId: target.membershipTypeId })
      .where(
        and(
          eq(table.member.id, member.id),
          eq(table.member.status, "active"),
          eq(table.member.membershipTypeId, currentTypeId),
        ),
      );
    await tx.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId,
      eventType: "membership_decision_corrected",
      effectiveAt: new Date(),
      source: "admin",
      certainty: "confirmed",
      actorUserId,
      relatedEventId: relatedEvent.id,
      membershipFeePeriodId: target.id,
      data: {
        reason: "Corrected an equal-priced membership type purchase",
        snapshot: {
          status: "active",
          membershipTypeId: target.membershipTypeId,
          pendingMembershipTypeId: member.pendingMembershipTypeId,
          currentMembershipStartedAt: member.currentMembershipStartedAt,
          currentMembershipEndedAt: null,
        },
      },
    });
    return correction;
  });
}
