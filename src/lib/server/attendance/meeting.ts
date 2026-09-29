import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "$lib/server/db";
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
  effectiveAt: Date;
  note?: string;
  target: AttendanceTarget;
};

export async function recordMeetingEvent(input: NewAttendanceEvent) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.meetingAttendanceEvent.findFirst({ where: { id: input.id } });
    if (existing) {
      if (
        existing.meetingId !== input.meetingId ||
        existing.actorId !== input.actorId ||
        existing.direction !== input.direction ||
        existing.source !== input.source ||
        existing.effectiveAt.getTime() !== input.effectiveAt.getTime()
      ) {
        throw new Error("Event ID already used for a different action");
      }
      return existing;
    }

    const [meeting] = await tx.select().from(table.meeting).where(eq(table.meeting.id, input.meetingId)).for("update");
    if (!meeting) throw new Error("Meeting not found");
    if (meeting.closedAt && input.source !== "correction") throw new Error("Meeting is closed");
    if (input.source === "correction" && !input.note?.trim()) throw new Error("Correction reason required");
    if (input.effectiveAt > new Date(Date.now() + 60_000)) throw new Error("Event time is in the future");
    if (meeting.closedAt && input.effectiveAt > meeting.closedAt)
      throw new Error("Correction time is after meeting close");

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

    const recesses = await tx.query.meetingRecess.findMany({ where: { meetingId: input.meetingId } });
    const activeRecess = recesses.find((recess) => !recess.cancelledAt && !recess.endedAt);
    if (input.source !== "correction") {
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
      const [activeMember] = await tx
        .select({ membershipTypeId: table.membership.membershipTypeId })
        .from(table.member)
        .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
        .where(
          and(
            eq(table.member.userId, attendee.userId),
            eq(table.member.status, "active"),
            lte(table.membership.startTime, input.effectiveAt),
            gte(table.membership.endTime, input.effectiveAt),
          ),
        )
        .orderBy(desc(table.membership.startTime))
        .limit(1);
      membershipTypeId = activeMember?.membershipTypeId ?? null;
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
        recessId: activeRecess?.id ?? null,
        membershipTypeId,
        note: input.note?.trim() || null,
        effectiveAt: input.effectiveAt,
      })
      .returning();
    if (!recorded) throw new Error("Could not record attendance");
    return recorded;
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
    if (effectiveAt > new Date(Date.now() + 60_000) || (meeting.closedAt && effectiveAt > meeting.closedAt)) {
      throw new Error("Corrected time is outside the meeting record");
    }
    const attendee = await tx.query.meetingAttendee.findFirst({ where: { id: attendeeId } });
    if (!attendee || attendee.meetingId !== input.meetingId) throw new Error("Attendee not found in meeting");
    const previouslyVoided = latest?.voided ?? false;
    if (input.operation === "void" && previouslyVoided) throw new Error("Action is already undone");
    if (input.operation === "restore" && !previouslyVoided) throw new Error("Action is already active");

    let membershipTypeId = latest ? latest.membershipTypeId : event.membershipTypeId;
    if (input.operation === "replace" && direction === "in") {
      membershipTypeId = null;
      if (attendee.userId) {
        const [activeMember] = await tx
          .select({ membershipTypeId: table.membership.membershipTypeId })
          .from(table.member)
          .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
          .where(
            and(
              eq(table.member.userId, attendee.userId),
              eq(table.member.status, "active"),
              lte(table.membership.startTime, effectiveAt),
              gte(table.membership.endTime, effectiveAt),
            ),
          )
          .orderBy(desc(table.membership.startTime))
          .limit(1);
        membershipTypeId = activeMember?.membershipTypeId ?? null;
      }
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
    if (
      Number.isNaN(input.startedAt.getTime()) ||
      input.startedAt < (meeting.startsAt ?? meeting.createdAt) ||
      input.startedAt > new Date() ||
      (input.endedAt &&
        (Number.isNaN(input.endedAt.getTime()) || input.endedAt < input.startedAt || input.endedAt > new Date()))
    )
      throw new Error("Invalid recess times");
    if (meeting.closedAt && (!input.endedAt || input.endedAt > meeting.closedAt))
      throw new Error("Recess must end before meeting closure");
    const others = await tx.query.meetingRecess.findMany({ where: { meetingId: input.meetingId } });
    if (
      !input.cancelled &&
      others.some(
        (other) =>
          other.id !== recess.id &&
          !other.cancelledAt &&
          input.startedAt < (other.endedAt ?? new Date(8_640_000_000_000_000)) &&
          other.startedAt < (input.endedAt ?? new Date(8_640_000_000_000_000)),
      )
    )
      throw new Error("Recesses cannot overlap");
    const changes = {
      mode: input.mode,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      cancelledAt: input.cancelled ? (recess.cancelledAt ?? new Date()) : null,
      cancelledBy: input.cancelled ? input.actorId : null,
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
          startedAt: input.startedAt.toISOString(),
          endedAt: input.endedAt?.toISOString() ?? null,
          cancelled: input.cancelled,
        },
        reason: input.reason.trim(),
      },
    });
    return tx.update(table.meetingRecess).set(changes).where(eq(table.meetingRecess.id, recess.id)).returning();
  });
}
