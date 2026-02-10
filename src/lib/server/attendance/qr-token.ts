import { encodeBase64url } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

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
      attendanceQrToken: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.attendanceQrToken) {
    return user.attendanceQrToken;
  }

  // Generate new token
  const token = generateQrToken();
  await db.update(table.user).set({ attendanceQrToken: token }).where(eq(table.user.id, userId));

  return token;
}

/**
 * Verifies a QR token and returns the associated user ID.
 *
 * @param token - QR token to verify
 * @returns User ID if valid, null otherwise
 */
export async function verifyQrToken(token: string): Promise<string | null> {
  const user = await db.query.user.findFirst({
    where: eq(table.user.attendanceQrToken, token),
    columns: {
      id: true,
    },
  });

  return user?.id ?? null;
}

/**
 * Regenerates a user's QR token (for security purposes).
 *
 * @param userId - User ID
 * @returns New QR token
 * @throws Error if user not found
 */
export async function regenerateQrToken(userId: string): Promise<string> {
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: {
      id: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const token = generateQrToken();
  await db.update(table.user).set({ attendanceQrToken: token }).where(eq(table.user.id, userId));

  return token;
}
