import { encodeBase64url } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Generates a cryptographically secure QR token.
 *
 * @returns Base64url-encoded 32-byte random token
 */
export function generateQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64url(bytes);
}

/**
 * Ensures a user has a QR token, creating one if needed.
 * Uses SET ... WHERE qr_token IS NULL to avoid TOCTOU races.
 *
 * @param userId - User ID
 * @returns The user's QR token
 * @throws Error if user not found
 */
export async function ensureUserHasQrToken(userId: string): Promise<string> {
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: {
      id: true,
      qrToken: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.qrToken) {
    return user.qrToken;
  }

  // Generate new token, only setting it if still null (avoids race condition)
  const token = generateQrToken();
  await db
    .update(table.user)
    .set({ qrToken: token })
    .where(and(eq(table.user.id, userId), isNull(table.user.qrToken)));

  // Re-read to get the actual token (ours or the concurrent one)
  const updated = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: { qrToken: true },
  });

  if (!updated?.qrToken) {
    throw new Error("Failed to set QR token");
  }

  return updated.qrToken;
}

/**
 * Verifies a QR token and returns the associated user ID.
 *
 * @param token - QR token to verify
 * @returns User ID if valid, null otherwise
 */
export async function verifyQrToken(token: string): Promise<string | null> {
  const user = await db.query.user.findFirst({
    where: eq(table.user.qrToken, token),
    columns: {
      id: true,
    },
  });

  return user?.id ?? null;
}
