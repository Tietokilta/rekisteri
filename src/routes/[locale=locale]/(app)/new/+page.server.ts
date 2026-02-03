import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, gt, gte, and, isNotNull } from "drizzle-orm";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";
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
  }));

  // Only consider memberships with blocking statuses when calculating the latest end time
  // This allows users to repurchase memberships if their previous one was cancelled or expired
  const blockingMemberships = memberships.filter((m) => BLOCKING_MEMBER_STATUSES.has(m.status));
  const latestEndTime =
    blockingMemberships.length > 0
      ? new Date(Math.max(...blockingMemberships.map((m) => m.endTime.getTime())))
      : new Date(0);

  // Only show purchasable memberships (non-expired, non-overlapping, with Stripe price)
  const availableResult = await db
    .select()
    .from(table.membership)
    .innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
    .where(
      and(
        gt(table.membership.endTime, new Date()),
        gte(table.membership.startTime, latestEndTime),
        isNotNull(table.membership.stripePriceId),
      ),
    );

  const availableMemberships = availableResult.map((r) => ({
    ...r.membership,
    membershipType: r.membership_type,
  }));

  // Check for valid aalto.fi email (primary or secondary)
  const primaryEmailDomain = event.locals.user.email.split("@")[1]?.toLowerCase();
  const isPrimaryAalto = primaryEmailDomain === "aalto.fi";

  const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
  const aaltoSecondaryEmail = secondaryEmails.find((e) => e.domain === "aalto.fi");
  const hasValidSecondaryAalto = aaltoSecondaryEmail ? isSecondaryEmailValid(aaltoSecondaryEmail) : false;
  const hasExpiredSecondaryAalto = aaltoSecondaryEmail && !isSecondaryEmailValid(aaltoSecondaryEmail);

  // Primary email is always considered valid (no expiration tracking for primary)
  // TODO: Consider adding expiration tracking for primary emails with expiring domains
  const hasValidAaltoEmail = isPrimaryAalto || hasValidSecondaryAalto;
  const hasExpiredAaltoEmail = !isPrimaryAalto && hasExpiredSecondaryAalto;

  return {
    user: event.locals.user,
    memberships,
    availableMemberships,
    hasValidAaltoEmail,
    hasExpiredAaltoEmail,
    aaltoEmailExpiry: isPrimaryAalto ? null : aaltoSecondaryEmail?.expiresAt,
  };
};
