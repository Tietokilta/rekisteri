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
      payments: { with: { feePeriod: true }, orderBy: { createdAt: "desc" } },
      obligations: { with: { feePeriod: true }, orderBy: { createdAt: "desc" } },
    },
  });

  return stableMembers
    .map((member) => {
      const selectedType = member.pendingMembershipType ?? member.membershipType;
      const latestPayment = member.payments[0];
      const latestPeriod = latestPayment?.feePeriod ?? member.obligations[0]?.feePeriod ?? null;
      const canBeDeemedResigned =
        member.status === "active" &&
        member.obligations.some(
          (obligation) =>
            obligation.disposition === "required" &&
            obligation.feePeriod.nonPaymentActionAt <= today &&
            !member.payments.some(
              (payment) =>
                payment.membershipFeePeriodId === obligation.membershipFeePeriodId &&
                payment.status === "succeeded" &&
                !payment.refundConfirmedAt &&
                !payment.invalidatedAt,
            ),
        );
      const row = {
        id: member.id,
        userId: member.userId,
        organizationName: member.organizationName,
        membershipId: latestPeriod?.id ?? "",
        status: member.status === "ended" ? ("resigned" as const) : member.status,
        stripeSessionId: latestPayment?.stripeSessionId ?? null,
        description: member.applicationMotive,
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
        membershipStripePriceId: latestPeriod?.stripePriceId ?? null,
        membershipStartTime: latestPeriod ? new Date(latestPeriod.startDate) : null,
        membershipEndTime: latestPeriod ? new Date(latestPeriod.endDate) : null,
        canBeDeemedResigned,
      };
      return { ...row, allMemberships: [row], membershipCount: 1 };
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

  const [membershipTypes, memberships, availableMemberships] = await Promise.all([
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
      memberships.flatMap((membership) => [
        Number(membership.startDate.slice(0, 4)),
        Number(membership.endDate.slice(0, 4)),
      ]),
    ),
  ).toSorted((left, right) => right - left);

  return {
    members: loadMembers(),
    membershipTypes,
    years,
    availableMemberships: availableMemberships.map((membership) => ({
      ...membership,
      startTime: new Date(membership.startDate),
      endTime: new Date(membership.endDate),
    })),
  };
};
