import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import { userHasAdminAccess } from "$lib/server/auth/admin";

async function loadMembers() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const stableMembers = await db.query.member.findMany({
    with: {
      user: true,
      membershipType: true,
      pendingMembershipType: true,
      events: {
        with: { actor: true, feePeriod: true },
        orderBy: { effectiveAt: "desc", recordedAt: "desc" },
      },
      payments: { with: { feePeriod: true }, orderBy: { createdAt: "desc" } },
      obligations: { with: { feePeriod: true }, orderBy: { createdAt: "desc" } },
    },
  });

  return stableMembers
    .map((member) => {
      const selectedType = member.pendingMembershipType ?? member.membershipType;
      const correctionPayment = member.payments.find(
        (payment) =>
          payment.feePeriod.membershipTypeId === selectedType?.id &&
          payment.feePeriod.stripePriceId &&
          !payment.invalidatedAt &&
          !payment.refundConfirmedAt &&
          (payment.status === "pending" || payment.status === "succeeded"),
      );
      const feePeriods = new Map(
        [
          ...member.obligations.map((obligation) => obligation.feePeriod),
          ...member.payments.map((payment) => payment.feePeriod),
        ].map((period) => [period.id, period]),
      );
      const feeHistory = [...feePeriods.values()]
        .toSorted((left, right) => right.startDate.localeCompare(left.startDate))
        .map((period) => {
          const obligation = member.obligations.find((candidate) => candidate.membershipFeePeriodId === period.id);
          return {
            id: period.id,
            membershipTypeId: period.membershipTypeId,
            startTime: new Date(period.startDate),
            endTime: new Date(period.endDate),
            stripePriceId: period.stripePriceId,
            obligation: obligation
              ? {
                  kind: obligation.kind,
                  disposition: obligation.disposition,
                  dispositionReason: obligation.dispositionReason,
                }
              : null,
            payments: member.payments
              .filter((payment) => payment.membershipFeePeriodId === period.id)
              .map((payment) => ({
                id: payment.id,
                status: payment.status,
                source: payment.source,
                amount: payment.amount,
                currency: payment.currency,
                paidAt: payment.paidAt,
                createdAt: payment.createdAt,
                stripeSessionId: payment.stripeSessionId,
                refundRequiredAt: payment.refundRequiredAt,
                refundConfirmedAt: payment.refundConfirmedAt,
                invalidatedAt: payment.invalidatedAt,
              })),
          };
        });
      const canBeDeemedResigned =
        member.status === "active" &&
        member.obligations.some(
          (obligation) =>
            obligation.disposition === "required" &&
            obligation.feePeriod.nonPaymentActionAt <= today &&
            member.payments.every(
              (payment) =>
                payment.membershipFeePeriodId !== obligation.membershipFeePeriodId ||
                payment.status !== "succeeded" ||
                Boolean(payment.refundConfirmedAt) ||
                Boolean(payment.invalidatedAt),
            ),
        );
      const membershipEvents = member.events.map((membershipEvent) => ({
        id: membershipEvent.id,
        eventType: membershipEvent.eventType,
        effectiveAt: membershipEvent.effectiveAt,
        recordedAt: membershipEvent.recordedAt,
        source: membershipEvent.source,
        certainty: membershipEvent.certainty,
        actorName: membershipEvent.actor
          ? [membershipEvent.actor.firstNames, membershipEvent.actor.lastName].filter(Boolean).join(" ") ||
            membershipEvent.actor.email
          : null,
        membershipFeePeriodId: membershipEvent.membershipFeePeriodId,
        feePeriodStartTime: membershipEvent.feePeriod ? new Date(membershipEvent.feePeriod.startDate) : null,
        feePeriodEndTime: membershipEvent.feePeriod ? new Date(membershipEvent.feePeriod.endDate) : null,
        data: membershipEvent.data,
      }));
      const row = {
        id: member.id,
        userId: member.userId,
        organizationName: member.organizationName,
        status: member.status,
        applicationMotive: member.applicationMotive,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        email: member.user?.email ?? null,
        firstNames: member.user?.firstNames ?? null,
        lastName: member.user?.lastName ?? null,
        homeMunicipality: member.user?.homeMunicipality ?? null,
        preferredLanguage: member.user?.preferredLanguage ?? null,
        isAllowedEmails: member.user?.isAllowedEmails ?? null,
        membershipTypeId: selectedType?.id ?? null,
        membershipTypeName: selectedType?.name ?? null,
        currentMembershipStartedAt: member.currentMembershipStartedAt,
        currentMembershipEndedAt: member.currentMembershipEndedAt,
        correctionFeePeriodId: correctionPayment?.membershipFeePeriodId ?? null,
        feePeriodYears: [...new Set(feeHistory.map((item) => item.startTime.getFullYear().toString()))],
        feeHistory,
        membershipEvents,
        canBeDeemedResigned,
      };
      return row;
    })
    .toSorted((left, right) => {
      const firstNameComparison = (left.firstNames ?? left.organizationName ?? "")
        .toLowerCase()
        .localeCompare((right.firstNames ?? right.organizationName ?? "").toLowerCase());
      return firstNameComparison || (left.lastName ?? "").localeCompare(right.lastName ?? "");
    });
}

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) return error(404, "Not found");

  const [membershipTypes, feePeriods, availableFeePeriods] = await Promise.all([
    db
      .select()
      .from(table.membershipType)
      .orderBy(asc(sql`${table.membershipType.name}->>'fi'`)),
    db
      .select({ startDate: table.membershipFeePeriod.startDate, endDate: table.membershipFeePeriod.endDate })
      .from(table.membershipFeePeriod),
    db
      .select({
        id: table.membershipFeePeriod.id,
        membershipTypeId: table.membershipFeePeriod.membershipTypeId,
        membershipTypeName: table.membershipType.name,
        requiresPayment: table.membershipType.requiresPayment,
        stripePriceId: table.membershipFeePeriod.stripePriceId,
        startDate: table.membershipFeePeriod.startDate,
        endDate: table.membershipFeePeriod.endDate,
      })
      .from(table.membershipFeePeriod)
      .innerJoin(table.membershipType, eq(table.membershipFeePeriod.membershipTypeId, table.membershipType.id))
      .orderBy(desc(table.membershipFeePeriod.startDate)),
  ]);

  const years = Array.from(
    new Set(
      feePeriods.flatMap((feePeriod) => [
        Number(feePeriod.startDate.slice(0, 4)),
        Number(feePeriod.endDate.slice(0, 4)),
      ]),
    ),
  ).toSorted((left, right) => right - left);

  return {
    members: loadMembers(),
    membershipTypes,
    years,
    availableFeePeriods: availableFeePeriods.map((feePeriod) => ({
      ...feePeriod,
      startTime: new Date(feePeriod.startDate),
      endTime: new Date(feePeriod.endDate),
    })),
  };
};
