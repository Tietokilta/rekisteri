import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, asc } from "drizzle-orm";
import { transitionMeetingSchema, checkOutAllSchema } from "./schema";

/**
 * Transitions a meeting to a new state.
 * Only accessible to admin users.
 *
 * State transitions:
 * - start: upcoming → ongoing (records START event, sets startedAt)
 * - recess_start: ongoing → recess (records RECESS_START event)
 * - recess_end: recess → ongoing (records RECESS_END event)
 * - finish: ongoing/recess → finished (records FINISH event, sets finishedAt)
 *
 * NOTE: For long recess (>10min), admin should manually check everyone out before starting recess.
 */
export const transitionMeeting = form(transitionMeetingSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  // Verify meeting exists and get current status
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, data.meetingId),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Validate state transition
  const validTransitions: Record<
    string,
    { from: string[]; to: string; eventType: "START" | "RECESS_START" | "RECESS_END" | "FINISH" }
  > = {
    start: { from: ["upcoming"], to: "ongoing", eventType: "START" },
    recess_start: { from: ["ongoing"], to: "recess", eventType: "RECESS_START" },
    recess_end: { from: ["recess"], to: "ongoing", eventType: "RECESS_END" },
    finish: { from: ["ongoing", "recess"], to: "finished", eventType: "FINISH" },
  };

  const transition = validTransitions[data.action];
  if (!transition) {
    error(400, "Invalid action");
  }

  if (!transition.from.includes(meeting.status)) {
    error(400, `Cannot ${data.action} a ${meeting.status} meeting`);
  }

  // Update meeting status
  const updates: Partial<typeof table.meeting.$inferInsert> = {
    status: transition.to as "upcoming" | "ongoing" | "recess" | "finished",
  };

  if (data.action === "start") {
    updates.startedAt = new Date();
  } else if (data.action === "finish") {
    updates.finishedAt = new Date();
  }

  await db.update(table.meeting).set(updates).where(eq(table.meeting.id, data.meetingId));

  // Record event
  await db.insert(table.meetingEvent).values({
    id: crypto.randomUUID(),
    meetingId: data.meetingId,
    eventType: transition.eventType,
    notes: data.notes || null,
    timestamp: new Date(),
  });

  return {
    success: true,
  };
});

/**
 * Checks out all currently checked-in attendees.
 * Used when starting a long recess where everyone leaves.
 */
export const checkOutAll = form(checkOutAllSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  // Get all attendance events for this meeting
  const events = await db.query.attendance.findMany({
    where: eq(table.attendance.meetingId, data.meetingId),
    orderBy: [asc(table.attendance.timestamp)],
  });

  // Calculate who's currently in
  const currentlyIn = new Set<string>();
  for (const e of events) {
    if (e.eventType === "CHECK_IN") {
      currentlyIn.add(e.userId);
    } else if (e.eventType === "CHECK_OUT") {
      currentlyIn.delete(e.userId);
    }
  }

  // Check out everyone
  const now = new Date();
  for (const userId of currentlyIn) {
    await db.insert(table.attendance).values({
      id: crypto.randomUUID(),
      meetingId: data.meetingId,
      userId,
      eventType: "CHECK_OUT",
      scanMethod: "manual",
      scannedBy: event.locals.user.id,
      timestamp: now,
    });
  }

  return {
    success: true,
    checkedOutCount: currentlyIn.size,
  };
});
