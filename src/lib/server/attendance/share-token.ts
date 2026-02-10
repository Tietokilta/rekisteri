import { encodeBase64url } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Generates a cryptographically secure share token.
 *
 * @returns Base64url-encoded 32-byte random token
 */
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64url(bytes);
}

/**
 * Ensures a meeting has a share token, creating one if needed.
 *
 * @param meetingId - Meeting ID
 * @returns The meeting's share token
 * @throws Error if meeting not found
 */
export async function ensureMeetingHasShareToken(meetingId: string): Promise<string> {
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, meetingId),
    columns: {
      id: true,
      shareToken: true,
    },
  });

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  if (meeting.shareToken) {
    return meeting.shareToken;
  }

  // Generate new token
  const token = generateShareToken();
  await db.update(table.meeting).set({ shareToken: token }).where(eq(table.meeting.id, meetingId));

  return token;
}

/**
 * Regenerates a meeting's share token (to invalidate old links).
 *
 * @param meetingId - Meeting ID
 * @returns New share token
 * @throws Error if meeting not found
 */
export async function regenerateShareToken(meetingId: string): Promise<string> {
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, meetingId),
    columns: {
      id: true,
    },
  });

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  const token = generateShareToken();
  await db.update(table.meeting).set({ shareToken: token }).where(eq(table.meeting.id, meetingId));

  return token;
}

/**
 * Verifies a share token and returns the associated meeting ID.
 *
 * @param token - Share token to verify
 * @returns Meeting ID if valid, null otherwise
 */
export async function verifyShareToken(token: string): Promise<string | null> {
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.shareToken, token),
    columns: {
      id: true,
    },
  });

  return meeting?.id ?? null;
}
