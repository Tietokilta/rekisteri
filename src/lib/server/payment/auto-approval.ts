import { and, eq, lte, desc } from "drizzle-orm";
import {
  type Schema,
  type Membership,
  type SecondaryEmail,
  membership,
  member,
  user,
  secondaryEmail,
} from "$lib/server/db";
import type { PostgresJsDatabase, PostgresJsTransaction } from "drizzle-orm/postgres-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbHandle = PostgresJsDatabase<Schema> | PostgresJsTransaction<Schema, any, any>;

/** Maximum gap (in ms) between preceding period end and new period start for auto-approval. */
const MAX_PRECEDING_GAP_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

/**
 * Check if a user is eligible for auto-approval when purchasing a membership.
 *
 * Auto-approval is granted when:
 * 1. The user had an active membership of the same membership type
 *    in the immediately preceding period (gap must be at most ~6 months)
 * 2. For student-verified memberships: the user still has a valid aalto.fi email
 *
 * @param db - Database handle (can be a transaction or regular db)
 * @param userId - The user purchasing the membership
 * @param newMembership - The membership being purchased
 */
export async function checkAutoApprovalEligibility<T extends DbHandle>(
  db: T,
  userId: string,
  newMembership: Membership,
): Promise<boolean> {
  // Find the immediately preceding membership of the same type
  // (same membershipTypeId, endTime <= newMembership.startTime, most recent)
  // @ts-expect-error - union type callability issue
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const precedingMembership = await db._query.membership.findFirst({
    where: and(
      eq(membership.membershipTypeId, newMembership.membershipTypeId),
      lte(membership.endTime, newMembership.startTime),
    ),
    orderBy: desc(membership.endTime),
  });

  if (!precedingMembership) {
    return false;
  }

  // Ensure the preceding period is actually adjacent (gap at most ~6 months)
  const gapMs = newMembership.startTime.getTime() - precedingMembership.endTime.getTime();
  if (gapMs > MAX_PRECEDING_GAP_MS) {
    return false;
  }

  // Check if user had an active member record for that preceding membership.
  // Only "active" qualifies — resigned members were deliberately removed by the
  // board at year-end (§8 p2) and should go through board review again.
  // @ts-expect-error - union type callability issue
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const previousMember = await db._query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.membershipId, precedingMembership.id), eq(member.status, "active")),
  });

  if (!previousMember) {
    return false;
  }

  // If student verification is required, check for valid aalto.fi email
  if (newMembership.requiresStudentVerification) {
    const hasValidStudentEmail = await checkStudentEmail(db, userId);
    if (!hasValidStudentEmail) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a user has a valid aalto.fi email (primary or verified secondary).
 */
async function checkStudentEmail(db: DbHandle, userId: string): Promise<boolean> {
  // Check primary email
  // @ts-expect-error - union type callability issue
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const u = await db._query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true },
  });

  if (!u) {
    return false;
  }

  const primaryDomain = u.email.split("@")[1]?.toLowerCase();
  if (primaryDomain === "aalto.fi") {
    return true;
  }

  // Check secondary emails using the passed db handle, filtering at DB level
  const aaltoEmails = await db
    .select({
      verifiedAt: secondaryEmail.verifiedAt,
      expiresAt: secondaryEmail.expiresAt,
    })
    .from(secondaryEmail)
    .where(and(eq(secondaryEmail.userId, userId), eq(secondaryEmail.domain, "aalto.fi")));
  return aaltoEmails.some((e: Pick<SecondaryEmail, "verifiedAt" | "expiresAt">) => isEmailValid(e));
}

/**
 * Check if a secondary email is currently valid (verified and not expired).
 * Inlined to avoid transitive dependency on $app/environment via secondary-email.ts.
 */
function isEmailValid(email: Pick<SecondaryEmail, "verifiedAt" | "expiresAt">): boolean {
  if (!email.verifiedAt) return false;
  if (!email.expiresAt) return true;
  return email.expiresAt > new Date();
}
