import { eq, and } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type { User, Passkey } from "$lib/server/db/schema";
import { encodeBase64url, decodeBase64url } from "@oslojs/encoding";
import { env } from "$lib/server/env";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "./secondary-email";
import { logger } from "$lib/server/telemetry";

/**
 * Generate registration options for creating a new passkey
 */
export async function createRegistrationOptions(user: {
  id: string;
  email: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  // Get user's existing passkeys to exclude them from registration
  const passkeys = await db.select().from(table.passkey).where(eq(table.passkey.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userName: user.email,
    userDisplayName: user.email,
    // Exclude existing credentials so user can't register the same key twice
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.id,
      type: "public-key",
      transports: passkey.transports ?? [],
    })),
    authenticatorSelection: {
      // Allow both platform (TouchID) and cross-platform (YubiKey) authenticators
      authenticatorAttachment: undefined,
      // Require discoverable credentials (resident keys) for usernameless login
      residentKey: "required",
      // User verification controls whether PIN/biometric is required:
      // - "required": Always ask for PIN/biometric (most secure, may block some keys)
      // - "preferred": Ask if available (balanced, e.g. Google Password Manager shows PIN)
      // - "discouraged": Don't ask (least friction, still secure with phishing protection)
      // Current: "preferred" provides good security while allowing hardware keys without PIN
      userVerification: "preferred",
    },
  });

  return options;
}

/**
 * Verify and store a passkey registration response
 */
export async function verifyAndStoreRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  userId: string,
  deviceName?: string,
): Promise<VerifiedRegistrationResponse> {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.RP_ORIGIN,
    expectedRPID: env.RP_ID,
    requireUserVerification: false, // Allow security keys without biometrics
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration verification failed");
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;

  // Store the passkey in the database
  await db.insert(table.passkey).values({
    id: credential.id,
    userId,
    publicKey: encodeBase64url(credential.publicKey),
    counter: credential.counter,
    deviceName: deviceName || "Unnamed device",
    transports: credential.transports,
    backedUp: credentialBackedUp,
    lastUsedAt: new Date(),
  });

  return verification;
}

/**
 * Generate authentication options for signing in with a passkey
 *
 * Uses resident keys (discoverable credentials) approach with empty allowCredentials
 * to prevent email enumeration - response is identical regardless of user existence.
 */
export async function createAuthenticationOptions(_userEmail: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
  // Always return empty allowCredentials to prevent enumeration
  // Browser will show all resident keys for this RP domain
  // This is timing-safe: same response whether user exists or not
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    allowCredentials: [],
    userVerification: "preferred",
  });

  return options;
}

/**
 * Verify a passkey authentication response and return the authenticated user
 * @param expectedEmail Optional email to validate against (prevents wrong account login)
 */
export async function verifyAuthenticationAndGetUser(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  expectedEmail?: string,
): Promise<{ user: User; passkey: Passkey } | null> {
  // Look up the passkey by credential ID
  const credentialId = response.id;
  const [passkey] = await db.select().from(table.passkey).where(eq(table.passkey.id, credentialId)).limit(1);

  if (!passkey) {
    return null;
  }

  // Get the user associated with this passkey
  const [user] = await db.select().from(table.user).where(eq(table.user.id, passkey.userId)).limit(1);

  if (!user) {
    return null;
  }

  // Validate that the passkey belongs to the expected email (prevents wrong account login)
  // Use case-insensitive comparison since email addresses are case-insensitive per RFC 5321
  if (expectedEmail) {
    const normalizedExpected = expectedEmail.toLowerCase();

    // Check primary email first
    const matchesPrimary = user.email.toLowerCase() === normalizedExpected;

    // Check verified secondary emails if primary doesn't match
    let matchesSecondary = false;
    if (!matchesPrimary) {
      const secondaryEmails = await getUserSecondaryEmails(user.id);
      matchesSecondary = secondaryEmails.some(
        (se) => se.email.toLowerCase() === normalizedExpected && isSecondaryEmailValid(se),
      );
    }

    if (!matchesPrimary && !matchesSecondary) {
      logger.warn("auth.passkey.email_mismatch", {
        "user.id": user.id,
        // Don't log full emails for privacy
        "expected.email.domain": expectedEmail.split("@")[1],
        "user.email.domain": user.email.split("@")[1],
      });
      return null;
    }
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(decodeBase64url(passkey.publicKey)),
        counter: passkey.counter,
        transports: passkey.transports || undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return null;
    }

    // Update counter and last used timestamp to prevent replay attacks
    await db
      .update(table.passkey)
      .set({
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      })
      .where(eq(table.passkey.id, credentialId));

    return { user, passkey };
  } catch (error) {
    logger.error("auth.passkey.verification_failed", error, {
      "credential.id": credentialId,
    });
    return null;
  }
}

/**
 * Get all passkeys for a user
 */
export async function getUserPasskeys(userId: string): Promise<table.Passkey[]> {
  return await db.select().from(table.passkey).where(eq(table.passkey.userId, userId));
}

/**
 * Check if a user has any passkeys registered
 */
export async function userHasPasskeys(userEmail: string): Promise<boolean> {
  const [user] = await db.select().from(table.user).where(eq(table.user.email, userEmail)).limit(1);

  if (!user) {
    return false;
  }

  const passkeys = await db.select().from(table.passkey).where(eq(table.passkey.userId, user.id)).limit(1);

  return passkeys.length > 0;
}

/**
 * Delete a passkey
 * Only deletes if the passkey belongs to the specified user
 */
export async function deletePasskey(passkeyId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(table.passkey)
    .where(
      and(eq(table.passkey.id, passkeyId), eq(table.passkey.userId, userId)), // Ensure user owns the passkey
    )
    .returning();

  return result.length > 0;
}

/**
 * Rename a passkey
 * Only renames if the passkey belongs to the specified user
 */
export async function renamePasskey(passkeyId: string, userId: string, deviceName: string): Promise<boolean> {
  const result = await db
    .update(table.passkey)
    .set({
      deviceName,
    })
    .where(
      and(eq(table.passkey.id, passkeyId), eq(table.passkey.userId, userId)), // Ensure user owns the passkey
    )
    .returning();

  return result.length > 0;
}
