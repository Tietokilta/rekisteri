import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "$lib/server/db";
import { membershipTypeAt } from "./membership";
import * as table from "$lib/server/db/schema";
import {
  bindEventsToRecess,
  meetingActionWarnings,
  meetingPhysicalEvents,
  meetingPhysicalPresence,
  meetingPresence,
  projectMeetingEvents,
  resolveMeetingEvents,
} from "$lib/shared/meeting-attendance";

export type AttendanceTarget = { attendeeId: string } | { userId: string } | { guestName: string };

export type NewAttendanceEvent = {
  id: string;
  meetingId: string;
  actorId: string;
  direction: "in" | "out";
  source: "manual" | "scan" | "correction";
  /** Required for corrections; live actions are timestamped by the server when recorded. */
  effectiveAt?: Date;
  note?: string;
  target: AttendanceTarget;
};

/** Time inputs are minute-precision, so lower bounds compare at the minute (10:00:40 accepts 10:00). */
function floorToMinute(date: Date) {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

/** Meetings may be created after they start, so allow back-dating to either start time too. */
function earliestEventTime(meeting: typeof table.meeting.$inferSelect) {
  return floorToMinute(
    new Date(
      Math.min(
        meeting.createdAt.getTime(),
        meeting.scheduledStartsAt?.getTime() ?? Infinity,
        meeting.startsAt?.getTime() ?? Infinity,
      ),
    ),
  );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function sameTarget(tx: Tx, attendeeId: string, target: AttendanceTarget) {
  if ("attendeeId" in target) return attendeeId === target.attendeeId;
  const attendee = await tx.query.meetingAttendee.findFirst({ where: { id: attendeeId } });
  if ("userId" in target) return attendee?.userId === target.userId;
  return !attendee?.userId && attendee?.displayName === target.guestName.trim();
}

export async function recordMeetingEvent(input: NewAttendanceEvent) {
  return db.transaction(async (tx) => {
    // Lock first so a concurrent retry with the same ID waits and then sees the stored event
    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, input.meetingId)).for("update");
    if (!meeting) throw new Error("Meeting not found");
    const existing = await tx.query.meetingAttendanceEvent.findFirst({ where: { id: input.id } });
    if (existing) {
      if (
        existing.meetingId !== input.meetingId ||
        existing.actorId !== input.actorId ||
        existing.direction !== input.direction ||
        existing.source !== input.source ||
        // Live actions are timestamped by the server, so a retry carries a new time
        (input.source === "correction" && existing.effectiveAt.getTime() !== input.effectiveAt?.getTime()) ||
        !(await sameTarget(tx, existing.attendeeId, input.target))
      ) {
        throw new Error("Event ID already used for a different action");
      }
      const existingAttendee = await tx.query.meetingAttendee.findFirst({ where: { id: existing.attendeeId } });
      if (!existingAttendee) throw new Error("Attendee not found in meeting");
      return { ...existing, attendee: existingAttendee };
    }

    // Live actions are timed after the lock, so they order correctly against a recess started meanwhile
    const effectiveAt = input.source === "correction" ? input.effectiveAt : new Date();
    if (!effectiveAt) throw new Error("Correction time required");
    if (meeting.closedAt && input.source !== "correction") throw new Error("Meeting is closed");
    if (input.source === "correction" && !input.note?.trim()) throw new Error("Correction reason required");
    if (effectiveAt > new Date(Date.now() + 60_000)) throw new Error("Event time is in the future");
    // Live actions happen now, which is always valid; only back-dated missed actions need a lower bound
    if (input.source === "correction" && effectiveAt < earliestEventTime(meeting))
      throw new Error("Event time is before the meeting");
    if (meeting.closedAt && effectiveAt > meeting.closedAt) throw new Error("Correction time is after meeting close");

    let attendee: typeof table.meetingAttendee.$inferSelect | undefined;
    if ("attendeeId" in input.target) {
      attendee = await tx.query.meetingAttendee.findFirst({ where: { id: input.target.attendeeId } });
      if (attendee?.meetingId !== input.meetingId) throw new Error("Attendee not found in meeting");
    } else if ("userId" in input.target) {
      attendee = await tx.query.meetingAttendee.findFirst({
        where: { meetingId: input.meetingId, userId: input.target.userId },
      });
      if (!attendee) {
        const person = await tx.query.user.findFirst({ where: { id: input.target.userId } });
        if (!person) throw new Error("User not found");
        const [created] = await tx
          .insert(table.meetingAttendee)
          .values({
            id: crypto.randomUUID(),
            meetingId: input.meetingId,
            userId: person.id,
            displayName: [person.firstNames, person.lastName].filter(Boolean).join(" ") || person.email,
            membershipTypeId: null,
          })
          .onConflictDoNothing()
          .returning();
        attendee =
          created ??
          (await tx.query.meetingAttendee.findFirst({
            where: { meetingId: input.meetingId, userId: person.id },
          }));
      }
    } else {
      const guestName = input.target.guestName.trim();
      if (!guestName) throw new Error("Guest name required");
      [attendee] = await tx
        .insert(table.meetingAttendee)
        .values({ id: crypto.randomUUID(), meetingId: input.meetingId, displayName: guestName })
        .returning();
    }
    if (!attendee) throw new Error("Could not create attendee");

    if (input.source !== "correction") {
      const recesses = await tx.query.meetingRecess.findMany({ where: { meetingId: input.meetingId } });
      const events = await tx.query.meetingAttendanceEvent.findMany({ where: { meetingId: input.meetingId } });
      const corrections = events.length
        ? await tx
            .select()
            .from(table.meetingAttendanceEventCorrection)
            .where(
              inArray(
                table.meetingAttendanceEventCorrection.eventId,
                events.map((event) => event.id),
              ),
            )
        : [];
      const active = bindEventsToRecess(
        resolveMeetingEvents(events, corrections).filter((event) => !event.voided),
        recesses,
      );
      const present = meetingPhysicalPresence(active, recesses).present.includes(attendee.id);
      if (input.direction === "in" && present) throw new Error("Already present");
      if (input.direction === "out" && !present) throw new Error("Already absent");
    }

    let membershipTypeId: string | null = null;
    if (input.direction === "in" && attendee.userId) {
      membershipTypeId = await membershipTypeAt(tx, attendee.userId, effectiveAt);
      if (input.source !== "correction") {
        await tx
          .update(table.meetingAttendee)
          .set({ membershipTypeId })
          .where(eq(table.meetingAttendee.id, attendee.id));
      }
    }

    const [recorded] = await tx
      .insert(table.meetingAttendanceEvent)
      .values({
        id: input.id,
        meetingId: input.meetingId,
        attendeeId: attendee.id,
        actorId: input.actorId,
        direction: input.direction,
        source: input.source,
        membershipTypeId,
        note: input.note?.trim() || null,
        effectiveAt,
      })
      .returning();
    if (!recorded) throw new Error("Could not record attendance");
    // Read within the transaction, so callers can show who was recorded even if the row is merged right after
    const attendeeAfter =
      input.direction === "in" && attendee.userId && input.source !== "correction"
        ? { ...attendee, membershipTypeId }
        : attendee;
    return { ...recorded, attendee: attendeeAfter };
  });
}

export async function correctMeetingEvent(input: {
  eventId: string;
  meetingId: string;
  actorId: string;
  reason: string;
  operation: "replace" | "void" | "restore";
  attendeeId?: string;
  direction?: "in" | "out";
  effectiveAt?: Date;
}) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new Error("A correction reason is required (up to 500 characters)");
  return db.transaction(async (tx) => {
    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, input.meetingId)).for("update");
    if (!meeting) throw new Error("Meeting not found");
    const event = await tx.query.meetingAttendanceEvent.findFirst({ where: { id: input.eventId } });
    if (!event || event.meetingId !== input.meetingId) throw new Error("Action not found in meeting");
    const latest = await tx.query.meetingAttendanceEventCorrection.findFirst({
      where: { eventId: event.id },
      orderBy: { revision: "desc" },
    });
    const attendeeId = input.operation === "replace" ? input.attendeeId : (latest?.attendeeId ?? event.attendeeId);
    const direction = input.operation === "replace" ? input.direction : (latest?.direction ?? event.direction);
    const effectiveAt = input.operation === "replace" ? input.effectiveAt : (latest?.effectiveAt ?? event.effectiveAt);
    if (!attendeeId || !direction || !effectiveAt || Number.isNaN(effectiveAt.getTime())) {
      throw new Error("Invalid correction");
    }
    // Undo and restore keep the recorded time, so only a replacement time is checked against the meeting
    if (
      input.operation === "replace" &&
      (effectiveAt < earliestEventTime(meeting) ||
        effectiveAt > new Date(Date.now() + 60_000) ||
        (meeting.closedAt && effectiveAt > meeting.closedAt))
    ) {
      throw new Error("Corrected time is outside the meeting record");
    }
    const attendee = await tx.query.meetingAttendee.findFirst({ where: { id: attendeeId } });
    if (!attendee || attendee.meetingId !== input.meetingId) throw new Error("Attendee not found in meeting");
    const previouslyVoided = latest?.voided ?? false;
    if (input.operation === "void" && previouslyVoided) throw new Error("Action is already undone");
    if (input.operation === "restore" && !previouslyVoided) throw new Error("Action is already active");

    let membershipTypeId = latest ? latest.membershipTypeId : event.membershipTypeId;
    if (input.operation === "replace" && direction === "in") {
      membershipTypeId = attendee.userId ? await membershipTypeAt(tx, attendee.userId, effectiveAt) : null;
    } else if (direction === "out") {
      membershipTypeId = null;
    }
    const [correction] = await tx
      .insert(table.meetingAttendanceEventCorrection)
      .values({
        id: crypto.randomUUID(),
        eventId: event.id,
        revision: (latest?.revision ?? 0) + 1,
        actorId: input.actorId,
        attendeeId,
        direction,
        effectiveAt,
        membershipTypeId,
        voided: input.operation === "void" || (input.operation !== "restore" && previouslyVoided),
        reason,
      })
      .returning();
    return correction;
  });
}

/**
 * Fixes who an attendee is: renames a guest, links a guest to a member, switches to another member,
 * or turns a member into a named guest. Applies to all of the attendee's entries, recalculating their
 * membership snapshots. Linking to a member who already has a row in the meeting merges the two rows.
 */
async function auditAttendeeUpdate(
  tx: Tx,
  input: { meetingId: string; actorId: string },
  attendee: typeof table.meetingAttendee.$inferSelect,
  after: { userId: string | null; displayName: string; mergedInto: string | null; reason: string },
) {
  await tx.insert(table.auditLog).values({
    id: crypto.randomUUID(),
    userId: input.actorId,
    action: "meeting.attendee_update",
    targetType: "meeting_attendee",
    targetId: attendee.id,
    metadata: {
      meetingId: input.meetingId,
      before: { userId: attendee.userId, displayName: attendee.displayName },
      after: { userId: after.userId, displayName: after.displayName },
      mergedInto: after.mergedInto,
      reason: after.reason,
    },
  });
}

export async function updateMeetingAttendee(input: {
  meetingId: string;
  attendeeId: string;
  actorId: string;
  target: { userId: string } | { guestName: string };
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500) throw new Error("A correction reason is required (up to 500 characters)");
  return db.transaction(async (tx) => {
    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, input.meetingId)).for("update");
    if (!meeting) throw new Error("Meeting not found");
    const attendee = await tx.query.meetingAttendee.findFirst({ where: { id: input.attendeeId } });
    if (attendee?.meetingId !== input.meetingId) throw new Error("Attendee not found in meeting");

    let userId: string | null = null;
    let displayName: string;
    let keptAttendeeId = attendee.id;
    // Only this attendee's own entries change person; rows already on a merge target keep their snapshots
    const [ownEvents, ownCorrections] = await Promise.all([
      tx.query.meetingAttendanceEvent.findMany({ where: { attendeeId: attendee.id }, columns: { id: true } }),
      tx.query.meetingAttendanceEventCorrection.findMany({ where: { attendeeId: attendee.id }, columns: { id: true } }),
    ]);
    const changingRowIds = new Set([...ownEvents, ...ownCorrections].map((row) => row.id));

    if ("userId" in input.target) {
      const person = await tx.query.user.findFirst({ where: { id: input.target.userId } });
      if (!person) throw new Error("User not found");
      userId = person.id;
      displayName = [person.firstNames, person.lastName].filter(Boolean).join(" ") || person.email;
      const existing = await tx.query.meetingAttendee.findFirst({
        where: { meetingId: input.meetingId, userId: person.id },
      });
      if (existing && existing.id !== attendee.id) {
        // The member already has a row: move this row's history onto it
        await tx
          .update(table.meetingAttendanceEvent)
          .set({ attendeeId: existing.id })
          .where(eq(table.meetingAttendanceEvent.attendeeId, attendee.id));
        await tx
          .update(table.meetingAttendanceEventCorrection)
          .set({ attendeeId: existing.id })
          .where(eq(table.meetingAttendanceEventCorrection.attendeeId, attendee.id));
        await tx.delete(table.meetingAttendee).where(eq(table.meetingAttendee.id, attendee.id));
        keptAttendeeId = existing.id;
      }
    } else {
      displayName = input.target.guestName.trim();
      if (!displayName || displayName.length > 200) throw new Error("Guest name required (up to 200 characters)");
    }

    if (userId === attendee.userId && keptAttendeeId === attendee.id) {
      // Same person (e.g. a guest renamed): their entries' membership snapshots stay as recorded
      await tx.update(table.meetingAttendee).set({ displayName }).where(eq(table.meetingAttendee.id, attendee.id));
      await auditAttendeeUpdate(tx, input, attendee, { userId, displayName, mergedInto: null, reason });
      return { attendeeId: attendee.id };
    }

    // Entries keep a membership snapshot taken at their own time; recalculate the ones changing person
    const events = await tx.query.meetingAttendanceEvent.findMany({ where: { attendeeId: keptAttendeeId } });
    const corrections = await tx.query.meetingAttendanceEventCorrection.findMany({
      where: { attendeeId: keptAttendeeId },
    });
    for (const row of [...events, ...corrections]) {
      if (!changingRowIds.has(row.id)) continue;
      const membershipTypeId =
        row.direction === "in" && userId ? await membershipTypeAt(tx, userId, row.effectiveAt) : null;
      if ("source" in row) {
        await tx
          .update(table.meetingAttendanceEvent)
          .set({ membershipTypeId })
          .where(eq(table.meetingAttendanceEvent.id, row.id));
      } else {
        await tx
          .update(table.meetingAttendanceEventCorrection)
          .set({ membershipTypeId })
          .where(eq(table.meetingAttendanceEventCorrection.id, row.id));
      }
    }
    // The attendee's type is the snapshot of their latest entry as it currently stands (not undone,
    // not moved to someone else by a correction)
    const meetingEvents = await tx.query.meetingAttendanceEvent.findMany({ where: { meetingId: input.meetingId } });
    const meetingCorrections = meetingEvents.length
      ? await tx
          .select()
          .from(table.meetingAttendanceEventCorrection)
          .where(
            inArray(
              table.meetingAttendanceEventCorrection.eventId,
              meetingEvents.map((event) => event.id),
            ),
          )
      : [];
    const latestEntry = resolveMeetingEvents(meetingEvents, meetingCorrections)
      .filter((entry) => entry.attendeeId === keptAttendeeId && !entry.voided && entry.direction === "in")
      .toSorted((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0];
    await tx
      .update(table.meetingAttendee)
      .set({ userId, displayName, membershipTypeId: latestEntry?.membershipTypeId ?? null })
      .where(eq(table.meetingAttendee.id, keptAttendeeId));

    await auditAttendeeUpdate(tx, input, attendee, {
      userId,
      displayName,
      mergedInto: keptAttendeeId === attendee.id ? null : keptAttendeeId,
      reason,
    });
    return { attendeeId: keptAttendeeId };
  });
}

export async function getMeetingState(meetingId: string, startsAt: Date | null, at?: Date) {
  const [attendees, events, corrections, recesses] = await Promise.all([
    db.query.meetingAttendee.findMany({ where: { meetingId }, orderBy: { displayName: "asc" } }),
    db.query.meetingAttendanceEvent.findMany({
      where: { meetingId },
      orderBy: { effectiveAt: "asc", recordedAt: "asc", id: "asc" },
    }),
    db
      .select({
        id: table.meetingAttendanceEventCorrection.id,
        eventId: table.meetingAttendanceEventCorrection.eventId,
        revision: table.meetingAttendanceEventCorrection.revision,
        attendeeId: table.meetingAttendanceEventCorrection.attendeeId,
        direction: table.meetingAttendanceEventCorrection.direction,
        effectiveAt: table.meetingAttendanceEventCorrection.effectiveAt,
        membershipTypeId: table.meetingAttendanceEventCorrection.membershipTypeId,
        voided: table.meetingAttendanceEventCorrection.voided,
        reason: table.meetingAttendanceEventCorrection.reason,
        actorId: table.meetingAttendanceEventCorrection.actorId,
        recordedAt: table.meetingAttendanceEventCorrection.recordedAt,
      })
      .from(table.meetingAttendanceEventCorrection)
      .innerJoin(
        table.meetingAttendanceEvent,
        eq(table.meetingAttendanceEventCorrection.eventId, table.meetingAttendanceEvent.id),
      )
      .where(eq(table.meetingAttendanceEvent.meetingId, meetingId)),
    db.query.meetingRecess.findMany({ where: { meetingId }, orderBy: { startedAt: "asc" } }),
  ]);
  const resolvedEvents = bindEventsToRecess(resolveMeetingEvents(events, corrections), recesses);
  const activeEvents = resolvedEvents.filter((event) => !event.voided);
  const projectedEvents = projectMeetingEvents(activeEvents, recesses, startsAt);
  const recessCorrections = recesses.length
    ? await db
        .select()
        .from(table.auditLog)
        .where(
          and(
            eq(table.auditLog.action, "meeting.recess_correct"),
            inArray(
              table.auditLog.targetId,
              recesses.map((recess) => recess.id),
            ),
          ),
        )
        .orderBy(table.auditLog.createdAt)
    : [];
  return {
    attendees,
    events,
    corrections,
    resolvedEvents,
    recesses,
    recessCorrections,
    projectedEvents,
    physicalPresent: meetingPhysicalPresence(activeEvents, recesses).present,
    warnings: meetingActionWarnings(meetingPhysicalEvents(activeEvents, recesses)),
    ...meetingPresence(projectedEvents, at),
  };
}

export async function startMeetingRecess(meetingId: string, actorId: string, mode: "track_exits" | "reset_all") {
  return db.transaction(async (tx) => {
    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, meetingId)).for("update");
    if (!meeting?.startsAt || meeting.closedAt) throw new Error("Meeting must be open and started");
    const [active] = await tx
      .select()
      .from(table.meetingRecess)
      .where(
        and(
          eq(table.meetingRecess.meetingId, meetingId),
          isNull(table.meetingRecess.endedAt),
          isNull(table.meetingRecess.cancelledAt),
        ),
      );
    if (active) throw new Error("A recess is already active");
    const [recess] = await tx
      .insert(table.meetingRecess)
      .values({ id: crypto.randomUUID(), meetingId, mode, startedAt: new Date(), startedBy: actorId })
      .returning();
    return recess;
  });
}

export async function endMeetingRecess(meetingId: string, actorId: string) {
  return db.transaction(async (tx) => {
    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, meetingId)).for("update");
    if (!meeting || meeting.closedAt) throw new Error("Meeting is closed or missing");
    const [active] = await tx
      .select()
      .from(table.meetingRecess)
      .where(
        and(
          eq(table.meetingRecess.meetingId, meetingId),
          isNull(table.meetingRecess.endedAt),
          isNull(table.meetingRecess.cancelledAt),
        ),
      );
    if (!active) throw new Error("No active recess");
    const [recess] = await tx
      .update(table.meetingRecess)
      .set({ endedAt: new Date(), endedBy: actorId })
      .where(eq(table.meetingRecess.id, active.id))
      .returning();
    return recess;
  });
}

export async function editMeetingRecess(input: {
  meetingId: string;
  recessId: string;
  actorId: string;
  mode: "track_exits" | "reset_all";
  startedAt: Date;
  endedAt: Date | null;
  cancelled: boolean;
  reason: string;
}) {
  if (!input.reason.trim()) throw new Error("Correction reason required");
  return db.transaction(async (tx) => {
    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, input.meetingId)).for("update");
    const recess = await tx.query.meetingRecess.findFirst({ where: { id: input.recessId } });
    if (!meeting || !recess || recess.meetingId !== input.meetingId) throw new Error("Recess not found");
    // Inputs are minute-precision: a start in the meeting's start minute means the meeting start itself,
    // since a recess can't begin before the meeting does
    const startedAt =
      meeting.startsAt && input.startedAt < meeting.startsAt && input.startedAt >= floorToMinute(meeting.startsAt)
        ? meeting.startsAt
        : input.startedAt;
    if (
      Number.isNaN(startedAt.getTime()) ||
      startedAt < (meeting.startsAt ?? floorToMinute(meeting.createdAt)) ||
      startedAt > new Date() ||
      (input.endedAt &&
        (Number.isNaN(input.endedAt.getTime()) || input.endedAt <= startedAt || input.endedAt > new Date()))
    )
      throw new Error("Invalid recess times");
    if (meeting.closedAt && !input.cancelled && (!input.endedAt || input.endedAt > meeting.closedAt))
      throw new Error("Recess must end before meeting closure");
    const others = await tx.query.meetingRecess.findMany({ where: { meetingId: input.meetingId } });
    if (
      !input.cancelled &&
      others.some(
        (other) =>
          other.id !== recess.id &&
          !other.cancelledAt &&
          startedAt < (other.endedAt ?? new Date(8_640_000_000_000_000)) &&
          other.startedAt < (input.endedAt ?? new Date(8_640_000_000_000_000)),
      )
    )
      throw new Error("Recesses cannot overlap");
    const changes = {
      mode: input.mode,
      startedAt,
      endedAt: input.endedAt,
      cancelledAt: input.cancelled ? (recess.cancelledAt ?? new Date()) : null,
      cancelledBy: input.cancelled ? (recess.cancelledBy ?? input.actorId) : null,
      endedBy: input.endedAt ? (recess.endedBy ?? input.actorId) : null,
    };
    await tx.insert(table.auditLog).values({
      id: crypto.randomUUID(),
      userId: input.actorId,
      action: "meeting.recess_correct",
      targetType: "meeting_recess",
      targetId: recess.id,
      metadata: {
        before: {
          mode: recess.mode,
          startedAt: recess.startedAt.toISOString(),
          endedAt: recess.endedAt?.toISOString() ?? null,
          cancelledAt: recess.cancelledAt?.toISOString() ?? null,
        },
        after: {
          mode: input.mode,
          startedAt: startedAt.toISOString(),
          endedAt: input.endedAt?.toISOString() ?? null,
          cancelled: input.cancelled,
        },
        reason: input.reason.trim(),
      },
    });
    return tx.update(table.meetingRecess).set(changes).where(eq(table.meetingRecess.id, recess.id)).returning();
  });
}
