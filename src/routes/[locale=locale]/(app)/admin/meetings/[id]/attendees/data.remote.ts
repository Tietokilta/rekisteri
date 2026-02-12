import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { manualCheckInSchema, manualCheckOutSchema } from "./schema";

/**
 * Manually checks in a user to a meeting.
 * Only accessible to admin users.
 */
export const manualCheckIn = form(manualCheckInSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  // Verify meeting exists
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, data.meetingId),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Verify user exists and has active membership
  const member = await db.query.member.findFirst({
    where: and(eq(table.member.userId, data.userId), eq(table.member.status, "active")),
  });

  if (!member) {
    error(400, "User does not have an active membership");
  }

  // Check if user is already checked in
  const lastEvent = await db.query.attendance.findFirst({
    where: and(eq(table.attendance.meetingId, data.meetingId), eq(table.attendance.userId, data.userId)),
    orderBy: [desc(table.attendance.timestamp)],
  });

  if (lastEvent?.eventType === "check_in") {
    error(400, "User is already checked in");
  }

  // Record check-in event
  await db.insert(table.attendance).values({
    id: crypto.randomUUID(),
    meetingId: data.meetingId,
    userId: data.userId,
    eventType: "check_in",
    scanMethod: "manual",
    scannedBy: event.locals.user.id,
    timestamp: new Date(),
  });

  return {
    success: true,
  };
});

/**
 * Manually checks out a user from a meeting.
 * Only accessible to admin users.
 */
export const manualCheckOut = form(manualCheckOutSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  // Verify meeting exists
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, data.meetingId),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Check if user is currently checked in
  const lastEvent = await db.query.attendance.findFirst({
    where: and(eq(table.attendance.meetingId, data.meetingId), eq(table.attendance.userId, data.userId)),
    orderBy: [desc(table.attendance.timestamp)],
  });

  if (!lastEvent || lastEvent.eventType === "check_out") {
    error(400, "User is not currently checked in");
  }

  // Record check-out event
  await db.insert(table.attendance).values({
    id: crypto.randomUUID(),
    meetingId: data.meetingId,
    userId: data.userId,
    eventType: "check_out",
    scanMethod: "manual",
    scannedBy: event.locals.user.id,
    timestamp: new Date(),
  });

  return {
    success: true,
  };
});
