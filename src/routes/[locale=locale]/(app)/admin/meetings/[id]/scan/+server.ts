import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { verifyQrToken } from "$lib/server/attendance/qr-token";
import { scanQrSchema } from "./schema";
import * as v from "valibot";

/**
 * POST /scan - Scans a member QR code for check-in or check-out.
 *
 * Double-scan prevention:
 * - If last event was CHECK_IN, this will CHECK_OUT
 * - If last event was CHECK_OUT (or no events), this will CHECK_IN
 *
 * Only accessible to admin users during ongoing meetings or recess.
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
  if (!locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  const body = await request.json();
  const parseResult = v.safeParse(scanQrSchema, body);

  if (!parseResult.success) {
    error(400, "Invalid request data");
  }

  const data = parseResult.output;

  // Verify meeting exists and is in correct state
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, params.id),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  if (meeting.status !== "ongoing" && meeting.status !== "recess") {
    error(400, `Cannot scan when meeting is ${meeting.status}`);
  }

  // Verify QR token and get user ID
  const userId = await verifyQrToken(data.token);

  if (!userId) {
    return json({
      success: false,
      error: "invalid_token",
      message: "Invalid or expired QR code",
    });
  }

  // Get user details for display
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: {
      id: true,
      email: true,
      firstNames: true,
      lastName: true,
    },
  });

  if (!user) {
    error(500, "User not found");
  }

  // Check if user has valid membership
  const validMember = await db.query.member.findFirst({
    where: and(
      eq(table.member.userId, userId),
      eq(table.member.status, "active"), // Only active members can attend
    ),
  });

  if (!validMember) {
    return json({
      success: false,
      error: "no_membership",
      message: "User does not have an active membership",
      user: {
        email: user.email,
        name: user.firstNames && user.lastName ? `${user.firstNames} ${user.lastName}` : user.email,
      },
    });
  }

  // Get last attendance event for this user at this meeting
  const lastEvent = await db.query.attendance.findFirst({
    where: and(eq(table.attendance.meetingId, params.id), eq(table.attendance.userId, userId)),
    orderBy: [desc(table.attendance.timestamp)],
  });

  // Determine event type (toggle between CHECK_IN and CHECK_OUT)
  const eventType = lastEvent?.eventType === "check_in" ? "check_out" : "check_in";

  // Record attendance event
  await db.insert(table.attendance).values({
    id: crypto.randomUUID(),
    meetingId: params.id,
    userId,
    eventType,
    scanMethod: "qr_scan",
    scannedBy: locals.user.id,
    timestamp: new Date(),
  });

  return json({
    success: true,
    eventType,
    user: {
      id: user.id,
      email: user.email,
      name: user.firstNames && user.lastName ? `${user.firstNames} ${user.lastName}` : user.email,
    },
  });
};
