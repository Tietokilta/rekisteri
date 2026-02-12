import { and, eq, lte, desc, inArray } from "drizzle-orm";
import * as table from "$lib/server/db/schema";
import type { Membership, SecondaryEmail } from "$lib/server/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type DbHandle = PostgresJsDatabase<typeof table>;

/** Maximum gap (in ms) between preceding period end and new period start for auto-approval. */
const MAX_PRECEDING_GAP_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

/**
 * Check if a user is eligible for auto-approval when purchasing a membership.
 *
 * Auto-approval is granted when:
 * 1. The user had an approved membership (active or expired) of the same membership type
 *    in the immediately preceding period (gap must be at most ~6 months)
 * 2. For student-verified memberships: the user still has a valid aalto.fi email
 *
 * @param db - Database handle (can be a transaction or regular db)
 * @param userId - The user purchasing the membership
 * @param newMembership - The membership being purchased
 */
export async function checkAutoApprovalEligibility(
  db: DbHandle,
  userId: string,
  newMembership: Membership,
): Promise<boolean> {
  // Find the immediately preceding membership of the same type
  // (same membershipTypeId, endTime <= newMembership.startTime, most recent)
  const precedingMembership = await db.query.membership.findFirst({
    where: and(
      eq(table.membership.membershipTypeId, newMembership.membershipTypeId),
      lte(table.membership.endTime, newMembership.startTime),
    ),
    orderBy: desc(table.membership.endTime),
  });

  if (!precedingMembership) {
    return false;
  }

  // Ensure the preceding period is actually adjacent (gap at most ~6 months)
  const gapMs = newMembership.startTime.getTime() - precedingMembership.endTime.getTime();
  if (gapMs > MAX_PRECEDING_GAP_MS) {
    return false;
  }

  // Check if user had an approved member record for that preceding membership
  // "active" or "resigned" status indicates the board approved it at some point
  const previousMember = await db.query.member.findFirst({
    where: and(
      eq(table.member.userId, userId),
      eq(table.member.membershipId, precedingMembership.id),
      inArray(table.member.status, ["active", "resigned"]),
    ),
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
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: { email: true },
  });

  if (!user) {
    return false;
  }

  const primaryDomain = user.email.split("@")[1]?.toLowerCase();
  if (primaryDomain === "aalto.fi") {
    return true;
  }

  // Check secondary emails using the passed db handle, filtering at DB level
  const aaltoEmails = await db
    .select({
      verifiedAt: table.secondaryEmail.verifiedAt,
      expiresAt: table.secondaryEmail.expiresAt,
    })
    .from(table.secondaryEmail)
    .where(and(eq(table.secondaryEmail.userId, userId), eq(table.secondaryEmail.domain, "aalto.fi")));
  return aaltoEmails.some((e) => isEmailValid(e));
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
