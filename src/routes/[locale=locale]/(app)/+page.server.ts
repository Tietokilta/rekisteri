import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, count, eq, gte } from "drizzle-orm";
import { ensureUserHasQrToken } from "$lib/server/attendance/qr-token";

type FeeState = "paid" | "overdue" | "not_due" | "no_fee" | "no_obligation";

function todayInHelsinki() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  const member = await db.query.member.findFirst({
    where: { userId: event.locals.user.id },
    with: {
      membershipType: true,
      pendingMembershipType: true,
      obligations: {
        with: { feePeriod: true, payments: true },
      },
    },
  });

  const requiredObligations =
    member?.obligations
      .filter((obligation) => obligation.disposition === "required")
      .toSorted((left, right) => right.feePeriod.startDate.localeCompare(left.feePeriod.startDate)) ?? [];
  const unsettledObligations = requiredObligations.filter((obligation) =>
    obligation.payments.every(
      (payment) => payment.status !== "succeeded" || !!payment.refundConfirmedAt || !!payment.invalidatedAt,
    ),
  );
  const overdueObligation = unsettledObligations.find((obligation) => obligation.feePeriod.dueDate < todayInHelsinki());
  const currentObligation = overdueObligation ?? unsettledObligations[0] ?? requiredObligations[0] ?? null;
  let feeState: FeeState = "no_obligation";

  if (member?.membershipType && !member.membershipType.requiresPayment) {
    feeState = "no_fee";
  } else if (currentObligation) {
    feeState = unsettledObligations.length === 0 ? "paid" : overdueObligation ? "overdue" : "not_due";
  }

  const qrToken = member?.status === "active" ? await ensureUserHasQrToken(event.locals.user.id) : null;

  const [availableCount] = await db
    .select({ value: count() })
    .from(table.membershipFeePeriod)
    .innerJoin(table.membershipType, eq(table.membershipFeePeriod.membershipTypeId, table.membershipType.id))
    .where(
      and(
        eq(table.membershipFeePeriod.acceptsApplications, true),
        gte(table.membershipFeePeriod.endDate, todayInHelsinki()),
        eq(table.membershipType.purchasable, true),
      ),
    );

  return {
    user: event.locals.user,
    member: member
      ? {
          id: member.id,
          status: member.status,
          membershipType: member.membershipType,
          pendingMembershipType: member.pendingMembershipType,
          currentMembershipStartedAt: member.currentMembershipStartedAt,
          currentMembershipEndedAt: member.currentMembershipEndedAt,
        }
      : null,
    feeState,
    currentFeePeriod: currentObligation?.feePeriod ?? null,
    qrToken,
    hasAvailableMemberships: (availableCount?.value ?? 0) > 0,
  };
};
