import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, gt, gte, and, isNotNull, count } from "drizzle-orm";
import { ensureUserHasQrToken } from "$lib/server/attendance/qr-token";
import { BLOCKING_MEMBER_STATUSES } from "$lib/shared/enums";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  const result = await db
    .select()
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
    .where(eq(table.member.userId, event.locals.user.id))
    .orderBy(desc(table.membership.startTime));

  const memberships = result.map((m) => ({
    ...m.membership,
    membershipType: m.membership_type,
    status: m.member.status,
    unique_id: m.member.id,
  }));

  // Load QR token if user has active or expired membership
  let qrToken: string | null = null;
  const hasValidMembership = memberships.some((m) => m.status === "active" || m.status === "expired");

  if (hasValidMembership) {
    qrToken = await ensureUserHasQrToken(event.locals.user.id);
  }

  // Compute whether there are available memberships to purchase
  const blockingMemberships = memberships.filter((m) => BLOCKING_MEMBER_STATUSES.has(m.status));
  const latestEndTime =
    blockingMemberships.length > 0
      ? new Date(Math.max(...blockingMemberships.map((m) => m.endTime.getTime())))
      : new Date(0);

  const [availableCount] = await db
    .select({ value: count() })
    .from(table.membership)
    .where(
      and(
        gt(table.membership.endTime, new Date()),
        gte(table.membership.startTime, latestEndTime),
        isNotNull(table.membership.stripePriceId),
      ),
    );

  const hasAvailableMemberships = (availableCount?.value ?? 0) > 0;

  return { user: event.locals.user, memberships, qrToken, hasAvailableMemberships };
};
