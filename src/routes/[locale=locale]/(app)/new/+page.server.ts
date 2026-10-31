import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { signInHref } from "#lib/server/auth/sign-in-next.js";
import { db } from "#lib/server/db/index.js";
import * as table from "#lib/server/db/schema.js";
import { eq, desc, gt, gte, and, isNotNull } from "drizzle-orm";
import { getUserSecondaryEmails, isSecondaryEmailValid, needsPersonalEmail } from "#lib/server/auth/secondary-email.js";
import { BLOCKING_MEMBER_STATUSES } from "#lib/shared/enums.js";
import { checkAutoApprovalEligibility } from "#lib/server/payment/auto-approval.js";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    return redirect(302, signInHref(event));
  }

  const user = event.locals.user;

  const result = await db
    .select()
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
    .where(eq(table.member.userId, user.id))
    .orderBy(desc(table.membership.startTime));

  const memberships = result.map((m) => ({
    ...m.membership,
    membershipType: m.membership_type,
    status: m.member.status,
  }));

  // Only consider memberships with blocking statuses when calculating the latest end time
  // This allows users to repurchase memberships if their previous one was resigned or rejected
  const blockingMemberships = memberships.filter((m) => BLOCKING_MEMBER_STATUSES.has(m.status));
  const latestEndTime = new Date(
    blockingMemberships.length > 0 ? Math.max(...blockingMemberships.map((m) => m.endTime.getTime())) : 0,
  );

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
        eq(table.membershipType.purchasable, true),
      ),
    );

  const availableMembershipsRaw = availableResult.map((r) => ({
    ...r.membership,
    membershipType: r.membership_type,
  }));

  // Check auto-approval eligibility for each available membership.
  // This runs 2-3 queries per membership (N+1), but the number of available
  // memberships is typically very small (2-5), so batching isn't worth the complexity.
  const availableMemberships = await Promise.all(
    availableMembershipsRaw.map(async (m) => ({
      ...m,
      willAutoApprove: await checkAutoApprovalEligibility(db, user.id, m),
    })),
  );

  // Check for valid aalto.fi email (primary or secondary)
  const primaryEmailDomain = user.email.split("@", 2)[1]?.toLowerCase();
  const isPrimaryAalto = primaryEmailDomain === "aalto.fi";

  const secondaryEmails = await getUserSecondaryEmails(user.id);
  const aaltoSecondaryEmails = secondaryEmails.filter((e) => e.domain === "aalto.fi");
  // A valid address wins over unverified or expired ones, e.g. a mistyped address left behind
  const validSecondaryAalto = aaltoSecondaryEmails.find((e) => isSecondaryEmailValid(e));
  const expiredSecondaryAalto = aaltoSecondaryEmails.find((e) => e.verifiedAt && !isSecondaryEmailValid(e));
  const aaltoSecondaryEmail = validSecondaryAalto ?? expiredSecondaryAalto;
  const hasValidSecondaryAalto = !!validSecondaryAalto;
  const hasExpiredSecondaryAalto = !validSecondaryAalto && !!expiredSecondaryAalto;

  // Primary email is always considered valid (no expiration tracking for primary)
  // TODO: Consider adding expiration tracking for primary emails with expiring domains
  const hasValidAaltoEmail = isPrimaryAalto || hasValidSecondaryAalto;
  const hasExpiredAaltoEmail = !isPrimaryAalto && hasExpiredSecondaryAalto;

  return {
    user,
    memberships,
    availableMemberships,
    hasValidAaltoEmail,
    hasExpiredAaltoEmail,
    aaltoEmailExpiry: isPrimaryAalto ? null : aaltoSecondaryEmail?.expiresAt,
    validAaltoEmail: isPrimaryAalto ? user.email : hasValidSecondaryAalto ? (aaltoSecondaryEmail?.email ?? null) : null,
    expiredAaltoEmail: hasExpiredAaltoEmail ? (aaltoSecondaryEmail?.email ?? null) : null,
    needsPersonalEmail: await needsPersonalEmail(user),
  };
};
