export type MeetingEvent = {
  id: string;
  attendeeId: string;
  direction: "in" | "out";
  membershipTypeId?: string | null;
  source?: "manual" | "scan" | "correction" | "recess";
  recessId?: string | null;
  effectiveAt: Date;
  recordedAt: Date;
};

const LAST_RECORDED_AT = new Date(8_640_000_000_000_000);

function compareMeetingEventOrder(a: MeetingEvent, b: MeetingEvent) {
  return (
    a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
    a.recordedAt.getTime() - b.recordedAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

export type MeetingRecess = {
  id: string;
  mode: "track_exits" | "reset_all";
  startedAt: Date;
  endedAt: Date | null;
  cancelledAt?: Date | null;
};

export function bindEventsToRecess<T extends MeetingEvent>(events: T[], recesses: MeetingRecess[]) {
  const active = recesses.filter((recess) => !recess.cancelledAt);
  return events.map((event) => ({
    ...event,
    recessId:
      active.find(
        (recess) => recess.startedAt <= event.effectiveAt && (!recess.endedAt || event.effectiveAt <= recess.endedAt),
      )?.id ?? null,
  }));
}

export type MeetingEventCorrection = {
  id: string;
  eventId: string;
  revision: number;
  attendeeId: string;
  direction: "in" | "out";
  effectiveAt: Date;
  membershipTypeId: string | null;
  voided: boolean;
  recordedAt: Date;
};

export function resolveMeetingEvents<T extends MeetingEvent>(events: T[], corrections: MeetingEventCorrection[]) {
  const latest = new Map<string, MeetingEventCorrection>();
  for (const correction of corrections.toSorted((a, b) => a.revision - b.revision)) {
    latest.set(correction.eventId, correction);
  }
  return events.map((event) => {
    const correction = latest.get(event.id);
    return {
      ...event,
      attendeeId: correction?.attendeeId ?? event.attendeeId,
      direction: correction?.direction ?? event.direction,
      effectiveAt: correction?.effectiveAt ?? event.effectiveAt,
      membershipTypeId: correction ? correction.membershipTypeId : (event.membershipTypeId ?? null),
      voided: correction?.voided ?? false,
      latestCorrectionId: correction?.id ?? null,
    };
  });
}

export type MeetingActionWarning = {
  eventId: string;
  attendeeId: string;
  code: "duplicate_in" | "out_without_in";
};

export function meetingActionWarnings(events: MeetingEvent[]): MeetingActionWarning[] {
  const present = new Set<string>();
  const warnings: MeetingActionWarning[] = [];
  for (const event of events.toSorted(
    (a, b) =>
      a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
      a.recordedAt.getTime() - b.recordedAt.getTime() ||
      a.id.localeCompare(b.id),
  )) {
    if (event.direction === "in") {
      if (present.has(event.attendeeId))
        warnings.push({ eventId: event.id, attendeeId: event.attendeeId, code: "duplicate_in" });
      present.add(event.attendeeId);
    } else {
      if (!present.has(event.attendeeId))
        warnings.push({ eventId: event.id, attendeeId: event.attendeeId, code: "out_without_in" });
      present.delete(event.attendeeId);
    }
  }
  return warnings;
}

export function meetingPresence(events: MeetingEvent[], at?: Date) {
  const present = new Set<string>();
  const everPresent = new Set<string>();
  const membershipTypeByAttendee: Record<string, string | null> = {};
  const ordered = events.toSorted(compareMeetingEventOrder);
  for (const event of ordered) {
    if (at && event.effectiveAt > at) break;
    if (event.direction === "in") {
      present.add(event.attendeeId);
      everPresent.add(event.attendeeId);
      membershipTypeByAttendee[event.attendeeId] = event.membershipTypeId ?? null;
    } else {
      present.delete(event.attendeeId);
    }
  }
  return { present: [...present], everPresent: [...everPresent], membershipTypeByAttendee };
}

/** Keep observed events unchanged; project only their effect on attendance. */
export function projectMeetingEvents(events: MeetingEvent[], recesses: MeetingRecess[], startsAt?: Date | null) {
  let meetingEvents = events;
  if (startsAt === null) {
    meetingEvents = [];
  } else if (startsAt) {
    const beforeStart = events.filter((event) => event.effectiveAt < startsAt).toSorted(compareMeetingEventOrder);
    const checkedIn = new Map<string, MeetingEvent>();
    for (const event of beforeStart) {
      if (event.direction === "in") checkedIn.set(event.attendeeId, event);
      else checkedIn.delete(event.attendeeId);
    }
    meetingEvents = [
      ...[...checkedIn.values()].map((event) => ({ ...event, effectiveAt: startsAt })),
      ...events.filter((event) => event.effectiveAt >= startsAt),
    ];
  }
  const activeRecesses = recesses.filter((recess) => !recess.cancelledAt);
  const activeRecessIds = new Set(activeRecesses.map((recess) => recess.id));
  const projected = meetingEvents
    .filter((event) => !event.recessId || !activeRecessIds.has(event.recessId))
    .map((event) => ({ ...event }));
  for (const recess of activeRecesses.toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    // Events bound to this recess are excluded from `projected`, so presence at its start includes
    // arrivals projected to the same instant (e.g. pre-start check-ins when the recess starts with the meeting)
    const initial = new Set(meetingPresence(projected, recess.startedAt).present);
    const actions = meetingEvents
      .filter((event) => event.recessId === recess.id && event.source !== "recess")
      .toSorted(compareMeetingEventOrder);
    if (recess.mode === "reset_all") {
      for (const attendeeId of initial) {
        projected.push({
          id: `recess:${recess.id}:out:${attendeeId}`,
          attendeeId,
          direction: "out",
          source: "recess",
          recessId: recess.id,
          effectiveAt: recess.startedAt,
          // Sort after every arrival projected to the same instant, even one recorded later
          recordedAt: LAST_RECORDED_AT,
        });
      }
    }
    if (recess.mode === "track_exits") {
      const exited = new Set<string>();
      for (const action of actions) {
        if (action.direction === "out" && initial.has(action.attendeeId) && !exited.has(action.attendeeId)) {
          projected.push({ ...action, effectiveAt: recess.startedAt, recordedAt: LAST_RECORDED_AT });
          exited.add(action.attendeeId);
        }
      }
    }
    if (recess.endedAt) {
      const absentAtStart = new Set(initial);
      for (const id of meetingPresence(projected, recess.startedAt).present) absentAtStart.delete(id);
      const lastAction = new Map(actions.map((action) => [action.attendeeId, action]));
      for (const action of lastAction.values()) {
        if (action.direction === "in" && (!initial.has(action.attendeeId) || absentAtStart.has(action.attendeeId))) {
          projected.push({ ...action, effectiveAt: recess.endedAt });
        }
      }
    }
  }
  return projected;
}

export function meetingPhysicalEvents(events: MeetingEvent[], recesses: MeetingRecess[]) {
  const physical = events.map((event) => ({ ...event }));
  for (const recess of recesses
    .filter((item) => item.mode === "reset_all" && !item.cancelledAt)
    .toSorted((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const initial = meetingPresence(physical, new Date(recess.startedAt.getTime() - 1)).present;
    for (const attendeeId of initial) {
      physical.push({
        id: `recess:${recess.id}:out:${attendeeId}`,
        attendeeId,
        direction: "out",
        source: "recess",
        recessId: recess.id,
        effectiveAt: recess.startedAt,
        recordedAt: recess.startedAt,
      });
    }
  }
  return physical;
}

export function meetingPhysicalPresence(events: MeetingEvent[], recesses: MeetingRecess[]) {
  return meetingPresence(meetingPhysicalEvents(events, recesses));
}
