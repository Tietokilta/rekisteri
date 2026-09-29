import { error } from "@sveltejs/kit";
import { command, form, getRequestEvent } from "$app/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import {
  correctMeetingEvent,
  editMeetingRecess,
  endMeetingRecess,
  recordMeetingEvent,
  startMeetingRecess,
  updateMeetingAttendee,
  type AttendanceTarget,
} from "$lib/server/attendance/meeting";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import {
  addMissedActionSchema,
  correctEventSchema,
  createMeetingSchema,
  editRecessSchema,
  meetingIdSchema,
  quickCorrectEventSchema,
  recordAttendanceSchema,
  startRecessSchema,
  updateAttendeeSchema,
  updateMeetingTimesSchema,
} from "./schema";

function requireActor() {
  const event = getRequestEvent();
  const actorId = event.locals.user?.id;
  if (!event.locals.session || !actorId || !userHasAdminWriteAccess(event.locals.user)) error(404, "Not found");
  return actorId;
}

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

/** Form results: `{ success: false, message }` for expected failures, so the sheet can stay open and show them. */
type FormResult = { success: true } | { success: false; message: string };

export const createMeeting = form(createMeetingSchema, async (data) => {
  const actorId = requireActor();
  const id = crypto.randomUUID();
  await db
    .insert(table.meeting)
    .values({ id, title: data.title, scheduledStartsAt: new Date(data.scheduledStartsAt), createdBy: actorId });
  return { success: true, id };
});

export const updateMeetingTimes = form(updateMeetingTimesSchema, async (data): Promise<FormResult> => {
  const actorId = requireActor();
  const scheduledStartsAt = new Date(data.scheduledStartsAt);
  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (startsAt && startsAt > new Date(Date.now() + 60_000)) {
    return { success: false, message: "Actual start cannot be in the future" };
  }
  try {
    await db.transaction(async (tx) => {
      const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, data.meetingId)).for("update");
      if (!meeting) throw new Error("Meeting not found");
      if (meeting.closedAt && (!startsAt || startsAt > meeting.closedAt)) {
        throw new Error("Actual start must be before meeting closure");
      }
      const recesses = await tx.query.meetingRecess.findMany({ where: { meetingId: meeting.id } });
      const firstRecess = recesses
        .filter((recess) => !recess.cancelledAt)
        .toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
      if (firstRecess && (!startsAt || startsAt > firstRecess.startedAt)) {
        throw new Error("Actual start must be before the first recess");
      }
      if (meeting.startsAt && !startsAt) {
        const firstEvent = await tx.query.meetingAttendanceEvent.findFirst({ where: { meetingId: meeting.id } });
        if (firstEvent) throw new Error("Actual start cannot be cleared after recording attendance");
      }
      await tx.update(table.meeting).set({ scheduledStartsAt, startsAt }).where(eq(table.meeting.id, meeting.id));
      await tx.insert(table.auditLog).values({
        id: crypto.randomUUID(),
        userId: actorId,
        action: "meeting.times_update",
        targetType: "meeting",
        targetId: meeting.id,
        metadata: {
          previousScheduledStartsAt: meeting.scheduledStartsAt?.toISOString() ?? null,
          previousStartsAt: meeting.startsAt?.toISOString() ?? null,
          scheduledStartsAt: scheduledStartsAt.toISOString(),
          startsAt: startsAt?.toISOString() ?? null,
        },
      });
    });
  } catch (cause) {
    return { success: false, message: message(cause, "Could not update meeting times") };
  }
  return { success: true };
});

export const startMeeting = command(meetingIdSchema, async ({ meetingId }) => {
  const actorId = requireActor();
  await db.transaction(async (tx) => {
    const now = new Date();
    const [started] = await tx
      .update(table.meeting)
      .set({ startsAt: now })
      .where(and(eq(table.meeting.id, meetingId), isNull(table.meeting.startsAt), isNull(table.meeting.closedAt)))
      .returning({ id: table.meeting.id });
    if (started) {
      await tx.insert(table.auditLog).values({
        id: crypto.randomUUID(),
        userId: actorId,
        action: "meeting.times_update",
        targetType: "meeting",
        targetId: started.id,
        metadata: { previousStartsAt: null, startsAt: now.toISOString() },
      });
    }
  });
});

export const closeMeeting = command(meetingIdSchema, async ({ meetingId }) => {
  const actorId = requireActor();
  try {
    await db.transaction(async (tx) => {
      const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, meetingId)).for("update");
      if (!meeting?.startsAt || meeting.closedAt) throw new Error("Meeting must be open and started");
      const [active] = await tx
        .select({ id: table.meetingRecess.id })
        .from(table.meetingRecess)
        .where(
          and(
            eq(table.meetingRecess.meetingId, meeting.id),
            isNull(table.meetingRecess.endedAt),
            isNull(table.meetingRecess.cancelledAt),
          ),
        );
      if (active) throw new Error("End the recess before closing the meeting");
      const closedAt = new Date();
      await tx.update(table.meeting).set({ closedAt }).where(eq(table.meeting.id, meeting.id));
      await tx.insert(table.auditLog).values({
        id: crypto.randomUUID(),
        userId: actorId,
        action: "meeting.close",
        targetType: "meeting",
        targetId: meeting.id,
        metadata: { closedAt: closedAt.toISOString() },
      });
    });
  } catch (cause) {
    error(400, message(cause, "Could not close meeting"));
  }
});

export const reopenMeeting = command(meetingIdSchema, async ({ meetingId }) => {
  const actorId = requireActor();
  try {
    await db.transaction(async (tx) => {
      const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, meetingId)).for("update");
      if (!meeting?.closedAt) throw new Error("Meeting is not closed");
      await tx.update(table.meeting).set({ closedAt: null }).where(eq(table.meeting.id, meeting.id));
      await tx.insert(table.auditLog).values({
        id: crypto.randomUUID(),
        userId: actorId,
        action: "meeting.reopen",
        targetType: "meeting",
        targetId: meeting.id,
        metadata: { previousClosedAt: meeting.closedAt.toISOString() },
      });
    });
  } catch (cause) {
    error(400, message(cause, "Could not reopen meeting"));
  }
});

export const startRecess = command(startRecessSchema, async ({ meetingId, mode }) => {
  const actorId = requireActor();
  try {
    await startMeetingRecess(meetingId, actorId, mode);
  } catch (cause) {
    error(400, message(cause, "Could not start recess"));
  }
});

export const endRecess = command(meetingIdSchema, async ({ meetingId }) => {
  const actorId = requireActor();
  try {
    await endMeetingRecess(meetingId, actorId);
  } catch (cause) {
    error(400, message(cause, "Could not end recess"));
  }
});

export const recordAttendance = command(recordAttendanceSchema, async (data) => {
  const actorId = requireActor();
  const target: AttendanceTarget = data.attendeeId
    ? { attendeeId: data.attendeeId }
    : data.userId
      ? { userId: data.userId }
      : { guestName: data.guestName ?? "" };
  try {
    const recorded = await recordMeetingEvent({
      id: data.eventId,
      meetingId: data.meetingId,
      actorId,
      direction: data.direction,
      source: "manual",
      target,
    });
    return { eventId: recorded.id };
  } catch (cause) {
    error(400, message(cause, "Could not record attendance"));
  }
});

export const addMissedAction = form(addMissedActionSchema, async (data): Promise<FormResult> => {
  const actorId = requireActor();
  try {
    await recordMeetingEvent({
      id: data.eventId,
      meetingId: data.meetingId,
      actorId,
      direction: data.direction,
      source: "correction",
      note: data.note,
      effectiveAt: new Date(data.effectiveAt),
      target: { attendeeId: data.attendeeId },
    });
  } catch (cause) {
    return { success: false, message: message(cause, "Could not record attendance") };
  }
  return { success: true };
});

export const correctEvent = form(correctEventSchema, async (data): Promise<FormResult> => {
  const actorId = requireActor();
  try {
    await correctMeetingEvent({
      eventId: data.eventId,
      meetingId: data.meetingId,
      actorId,
      reason: data.reason,
      operation: data.operation,
      attendeeId: data.operation === "replace" ? data.attendeeId : undefined,
      direction: data.operation === "replace" ? data.direction : undefined,
      effectiveAt: data.operation === "replace" ? new Date(data.effectiveAt) : undefined,
    });
  } catch (cause) {
    return { success: false, message: message(cause, "Could not correct action") };
  }
  return { success: true };
});

export const quickCorrectEvent = command(quickCorrectEventSchema, async (data) => {
  const actorId = requireActor();
  try {
    const correction = await correctMeetingEvent({
      eventId: data.eventId,
      meetingId: data.meetingId,
      actorId,
      reason: data.reason,
      operation: data.operation,
    });
    return { correctionId: correction?.id };
  } catch (cause) {
    error(400, message(cause, "Could not correct action"));
  }
});

export const editRecess = form(editRecessSchema, async (data): Promise<FormResult> => {
  const actorId = requireActor();
  try {
    await editMeetingRecess({
      meetingId: data.meetingId,
      recessId: data.recessId,
      actorId,
      mode: data.mode,
      startedAt: new Date(data.startedAt),
      endedAt: data.endedAt ? new Date(data.endedAt) : null,
      cancelled: data.cancelled === "true",
      reason: data.reason,
    });
  } catch (cause) {
    return { success: false, message: message(cause, "Could not correct recess") };
  }
  return { success: true };
});

export const updateAttendee = form(updateAttendeeSchema, async (data): Promise<FormResult> => {
  const actorId = requireActor();
  try {
    await updateMeetingAttendee({
      meetingId: data.meetingId,
      attendeeId: data.attendeeId,
      actorId,
      target: data.userId ? { userId: data.userId } : { guestName: data.guestName },
      reason: data.reason,
    });
  } catch (cause) {
    return { success: false, message: message(cause, "Could not update attendee") };
  }
  return { success: true };
});
