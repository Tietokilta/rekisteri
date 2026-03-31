import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import * as v from "valibot";
import { db } from "../db";
import * as table from "../db/schema";
import type { SecondaryEmail, User } from "../db/schema";
import type { RequestEvent } from "@sveltejs/kit";
import { auditEmailChange } from "../audit";

/**
 * Domains that require periodic re-verification
 */
const EXPIRING_DOMAINS: Record<string, { months: number }> = {
  "aalto.fi": { months: 6 },
  // Add more domains as needed
};

/**
 * Calculate expiration date for a domain based on verification time
 * Returns null for domains that never expire
 */
export function calculateExpiry(domain: string, verifiedAt: Date): Date | null {
  const policy = EXPIRING_DOMAINS[domain.toLowerCase()];
  if (!policy) return null;

  const expiry = new Date(verifiedAt);
  expiry.setMonth(expiry.getMonth() + policy.months);
  return expiry;
}

/**
 * Check if a secondary email is currently valid
 * Valid means: verified AND not expired (if expiry is set)
 */
export function isSecondaryEmailValid(secondaryEmail: SecondaryEmail): boolean {
  // Not verified yet
  if (!secondaryEmail.verifiedAt) return false;

  // No expiry means it never expires
  if (!secondaryEmail.expiresAt) return true;

  // Check if expired
  return secondaryEmail.expiresAt > new Date();
}

/**
 * Extract domain from email address
 * Validates email format using Valibot before extracting domain
 */
export function extractDomain(email: string): string {
  // Validate email format
  const validationResult = v.safeParse(v.pipe(v.string(), v.email()), email);
  if (!validationResult.success) {
    throw new Error("Invalid email format");
  }

  // Extract domain (guaranteed to exist after validation)
  const domain = validationResult.output.toLowerCase().split("@")[1];
  if (!domain) {
    throw new Error("Invalid email format: missing domain");
  }

  return domain;
}

/**
 * Check if a user has a valid secondary email for a specific domain
 */
export function hasValidDomainEmail(secondaryEmails: SecondaryEmail[], domain: string): boolean {
  return secondaryEmails.some(
    (email) => email.domain.toLowerCase() === domain.toLowerCase() && isSecondaryEmailValid(email),
  );
}

/**
 * Find a user by email address, checking both primary and VERIFIED secondary emails
 * Email lookup is case-insensitive
 * Returns null if no user found with that email
 *
 * SECURITY: Only verified secondary emails are considered to prevent account takeover
 * attacks where an attacker adds someone else's email as unverified secondary email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase();

  // First check primary email
  const [primaryResult] = await db.select().from(table.user).where(eq(table.user.email, normalizedEmail)).limit(1);

  if (primaryResult) {
    return primaryResult;
  }

  // Then check VERIFIED secondary emails only
  // SECURITY: Unverified secondary emails MUST NOT be used for authentication
  // to prevent account takeover attacks
  const [secondaryResult] = await db
    .select({
      user: table.user,
    })
    .from(table.secondaryEmail)
    .innerJoin(table.user, eq(table.user.id, table.secondaryEmail.userId))
    .where(and(eq(table.secondaryEmail.email, normalizedEmail), isNotNull(table.secondaryEmail.verifiedAt)));

  return secondaryResult?.user ?? null;
}

/**
 * Batch lookup users by multiple email addresses
 * Checks both primary and VERIFIED secondary emails
 * Returns a Map of email (lowercase) to User
 *
 * More efficient than calling getUserByEmail in a loop
 *
 * SECURITY: Only verified secondary emails are considered
 */
export async function getUsersByEmails(emails: string[]): Promise<Map<string, User>> {
  if (emails.length === 0) {
    return new Map();
  }

  const normalizedEmails = emails.map((e) => e.toLowerCase());
  const emailToUser = new Map<string, User>();

  // Batch query primary emails
  const primaryUsers = await db.select().from(table.user).where(inArray(table.user.email, normalizedEmails));

  for (const user of primaryUsers) {
    emailToUser.set(user.email, user);
  }

  // Batch query VERIFIED secondary emails
  const secondaryResults = await db
    .select({
      email: table.secondaryEmail.email,
      user: table.user,
    })
    .from(table.secondaryEmail)
    .innerJoin(table.user, eq(table.user.id, table.secondaryEmail.userId))
    .where(and(inArray(table.secondaryEmail.email, normalizedEmails), isNotNull(table.secondaryEmail.verifiedAt)));

  for (const result of secondaryResults) {
    // Only add if not already found via primary email
    if (!emailToUser.has(result.email)) {
      emailToUser.set(result.email, result.user);
    }
  }

  return emailToUser;
}

/**
 * Delete all unverified secondary email claims for a given email address
 * This should be called when someone legitimately signs up/in with an email
 * to prevent email squatting attacks
 *
 * Returns the number of deleted claims
 */
export async function deleteUnverifiedSecondaryEmailClaims(email: string): Promise<number> {
  const normalizedEmail = email.toLowerCase();

  const result = await db
    .delete(table.secondaryEmail)
    .where(and(eq(table.secondaryEmail.email, normalizedEmail), isNull(table.secondaryEmail.verifiedAt)))
    .returning();

  return result.length;
}

/**
 * Get all secondary emails for a user
 * Returns emails sorted by creation date (newest first)
 */
export async function getUserSecondaryEmails(userId: string): Promise<SecondaryEmail[]> {
  const emails = await db
    .select()
    .from(table.secondaryEmail)
    .where(eq(table.secondaryEmail.userId, userId))
    .orderBy(table.secondaryEmail.createdAt);

  return emails;
}

/**
 * Get a secondary email by ID, ensuring it belongs to the user
 * Returns null if not found or doesn't belong to user
 */
export async function getSecondaryEmailById(emailId: string, userId: string): Promise<SecondaryEmail | null> {
  const [email] = await db
    .select()
    .from(table.secondaryEmail)
    .where(and(eq(table.secondaryEmail.id, emailId), eq(table.secondaryEmail.userId, userId)));

  return email ?? null;
}

/**
 * Create a new unverified secondary email
 * Validates:
 * - Email format
 * - Not already a primary email (any user)
 * - Not already a verified secondary email (other users)
 * - User hasn't exceeded limit (10 emails)
 *
 * Returns existing email if user already has this email (verified or not)
 * Throws error if validation fails
 */
export async function createSecondaryEmail(userId: string, email: string): Promise<SecondaryEmail> {
  const normalizedEmail = email.toLowerCase();

  // Validate email format
  const domain = extractDomain(normalizedEmail);

  // Check if this user already has this email (verified or not)
  const existingUserEmail = await db
    .select()
    .from(table.secondaryEmail)
    .where(and(eq(table.secondaryEmail.userId, userId), eq(table.secondaryEmail.email, normalizedEmail)))
    .limit(1);

  const existingEmail = existingUserEmail[0];
  if (existingEmail) {
    // User is trying to re-add their own email - return it so we can redirect to verify
    return existingEmail;
  }

  // Check if email already exists as primary email
  // SECURITY: Use generic error message to prevent email enumeration
  const existingPrimaryUser = await db.select().from(table.user).where(eq(table.user.email, normalizedEmail)).limit(1);

  if (existingPrimaryUser.length > 0) {
    throw new Error("Could not add this email. Please try a different email address.");
  }

  // Check if email already exists as VERIFIED secondary email for another user
  // Unverified emails from other users don't block - prevents email squatting
  // SECURITY: Use generic error message to prevent email enumeration
  const existingVerifiedSecondaryEmail = await db
    .select()
    .from(table.secondaryEmail)
    .where(eq(table.secondaryEmail.email, normalizedEmail))
    .limit(1);

  const existingVerified = existingVerifiedSecondaryEmail[0];
  if (existingVerified && existingVerified.verifiedAt !== null) {
    throw new Error("Could not add this email. Please try a different email address.");
  }

  // Check user hasn't exceeded limit
  const userEmailCount = await db.select().from(table.secondaryEmail).where(eq(table.secondaryEmail.userId, userId));

  if (userEmailCount.length >= 10) {
    throw new Error("Maximum 10 secondary emails allowed");
  }

  // Create unverified secondary email
  const newEmail: SecondaryEmail = {
    id: crypto.randomUUID(),
    userId,
    email: normalizedEmail,
    domain,
    verifiedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(table.secondaryEmail).values(newEmail);

  return newEmail;
}

/**
 * Mark a secondary email as verified and calculate expiry
 */
export async function markSecondaryEmailVerified(emailId: string, userId: string): Promise<boolean> {
  const email = await getSecondaryEmailById(emailId, userId);
  if (!email) {
    return false;
  }

  const verifiedAt = new Date();
  const expiresAt = calculateExpiry(email.domain, verifiedAt);

  await db.update(table.secondaryEmail).set({ verifiedAt, expiresAt }).where(eq(table.secondaryEmail.id, emailId));

  return true;
}

/**
 * Delete a secondary email
 * Returns true if deleted, false if not found or doesn't belong to user
 */
export async function deleteSecondaryEmail(emailId: string, userId: string): Promise<boolean> {
  const email = await getSecondaryEmailById(emailId, userId);
  if (!email) {
    return false;
  }

  await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.id, emailId));

  return true;
}

/**
 * Change user's primary email to a secondary email
 * The current primary email becomes a secondary email
 *
 * Validates:
 * - Secondary email exists and belongs to user
 * - Secondary email is verified
 * - Not expired (if expiry is set)
 *
 * Process:
 * 1. Validates secondary email
 * 2. Gets current primary email from user record
 * 3. In a transaction:
 *    a. Updates user's primary email
 *    b. Deletes the promoted secondary email record
 *    c. Creates new secondary email from old primary
 *    d. Logs the email change for audit trail
 *
 * Returns true if successful, false if validation fails
 */
export async function changePrimaryEmail(emailId: string, userId: string, event: RequestEvent): Promise<boolean> {
  // Get and validate the secondary email
  const secondaryEmail = await getSecondaryEmailById(emailId, userId);
  if (!secondaryEmail) {
    return false;
  }

  // Must be verified
  if (!secondaryEmail.verifiedAt) {
    return false;
  }

  // Must not be expired
  if (!isSecondaryEmailValid(secondaryEmail)) {
    return false;
  }

  // Get current user record
  const [user] = await db.select().from(table.user).where(eq(table.user.id, userId));
  if (!user) {
    return false;
  }

  const oldPrimaryEmail = user.email;
  const newPrimaryEmail = secondaryEmail.email;

  // Don't do anything if they're already the same
  if (oldPrimaryEmail.toLowerCase() === newPrimaryEmail.toLowerCase()) {
    return false;
  }

  // Perform the swap in a transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // 1. Update user's primary email
    await tx.update(table.user).set({ email: newPrimaryEmail }).where(eq(table.user.id, userId));

    // 2. Delete the promoted secondary email
    await tx.delete(table.secondaryEmail).where(eq(table.secondaryEmail.id, emailId));

    // 3. Create new secondary email from old primary
    const oldPrimaryDomain = extractDomain(oldPrimaryEmail);
    const newSecondaryEmail: SecondaryEmail = {
      id: crypto.randomUUID(),
      userId,
      email: oldPrimaryEmail.toLowerCase(),
      domain: oldPrimaryDomain,
      verifiedAt: new Date(), // Old primary is already verified
      expiresAt: calculateExpiry(oldPrimaryDomain, new Date()),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await tx.insert(table.secondaryEmail).values(newSecondaryEmail);
  });

  // 4. Log the email change for audit trail
  await auditEmailChange(event, userId, oldPrimaryEmail, newPrimaryEmail);

  return true;
}
