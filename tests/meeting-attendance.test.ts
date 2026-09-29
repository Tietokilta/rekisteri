import { describe, expect, it } from "vitest";
import {
  bindEventsToRecess,
  meetingActionWarnings,
  meetingPhysicalPresence,
  meetingPresence,
  projectMeetingEvents,
  resolveMeetingEvents,
  type MeetingEvent,
  type MeetingEventCorrection,
} from "../src/lib/shared/meeting-attendance";

const time = (minute: number) => new Date(`2026-10-01T12:${String(minute).padStart(2, "0")}:00Z`);
const event = (
  id: string,
  attendeeId: string,
  direction: "in" | "out",
  minute: number,
  recorded = minute,
): MeetingEvent => ({
  id,
  attendeeId,
  direction,
  effectiveAt: time(minute),
  recordedAt: time(recorded),
});

describe("meeting presence", () => {
  it("counts only people still checked in when a meeting starts", () => {
    const events = [
      { ...event("entered", "stayed", "in", 10), membershipTypeId: "old" },
      { ...event("left", "left", "in", 11), membershipTypeId: "old" },
      event("brief-exit", "stayed", "out", 12),
      event("left-again", "left", "out", 12),
      { ...event("reentered", "stayed", "in", 13), membershipTypeId: "new" },
    ];
    expect(projectMeetingEvents(events, [], null)).toEqual([]);
    expect(meetingPhysicalPresence(events, []).present).toEqual(["stayed"]);

    const projected = projectMeetingEvents(events, [], time(20));
    expect(projected).toHaveLength(1);
    expect(projected[0]?.effectiveAt).toEqual(time(20));
    expect(meetingPresence(projected, time(19)).present).toEqual([]);
    expect(meetingPresence(projected, time(20)).present).toEqual(["stayed"]);
    expect(meetingPresence(projected).membershipTypeByAttendee.stayed).toBe("new");
    expect(meetingPresence(projected).everPresent).not.toContain("left");
  });

  it("reconstructs presence at a vote and after re-entry", () => {
    const events = [event("d", "member", "in", 30), event("b", "member", "out", 20), event("a", "member", "in", 10)];
    expect(meetingPresence(events, time(15)).present).toEqual(["member"]);
    expect(meetingPresence(events, time(25)).present).toEqual([]);
    expect(meetingPresence(events).present).toEqual(["member"]);
    expect(meetingPresence(events).everPresent).toEqual(["member"]);
  });

  it("uses a later recorded correction at the same effective time", () => {
    const events = [event("a", "guest", "in", 10), event("b", "guest", "out", 20), event("c", "guest", "in", 20, 40)];
    expect(meetingPresence(events).present).toEqual(["guest"]);
  });

  it("keeps the original action while undoing and restoring any earlier action", () => {
    const events = [event("a", "member", "in", 10), event("b", "member", "out", 20)];
    const corrections: MeetingEventCorrection[] = [
      {
        id: "first",
        eventId: "a",
        revision: 1,
        attendeeId: "member",
        direction: "in",
        effectiveAt: time(10),
        membershipTypeId: "regular",
        voided: true,
        recordedAt: time(30),
      },
    ];
    const undone = resolveMeetingEvents(events, corrections);
    expect(events[0]?.direction).toBe("in");
    expect(meetingActionWarnings(undone.filter((item) => !item.voided))).toEqual([
      { eventId: "b", attendeeId: "member", code: "out_without_in" },
    ]);
    corrections.push({
      ...corrections[0],
      id: "second",
      revision: 2,
      voided: false,
      recordedAt: time(35),
    } as MeetingEventCorrection);
    const restored = resolveMeetingEvents(events, corrections);
    expect(meetingPresence(restored.filter((item) => !item.voided)).present).toEqual([]);
    expect(meetingActionWarnings(restored.filter((item) => !item.voided))).toEqual([]);
  });

  it("warns about duplicate entries after an earlier action is corrected", () => {
    const events = [event("a", "member", "in", 10), event("b", "member", "out", 20), event("c", "member", "in", 30)];
    const corrected = resolveMeetingEvents(events, [
      {
        id: "change",
        eventId: "b",
        revision: 1,
        attendeeId: "member",
        direction: "in",
        effectiveAt: time(20),
        membershipTypeId: "regular",
        voided: false,
        recordedAt: time(40),
      },
    ]);
    expect(meetingActionWarnings(corrected)).toEqual([
      { eventId: "b", attendeeId: "member", code: "duplicate_in" },
      { eventId: "c", attendeeId: "member", code: "duplicate_in" },
    ]);
  });
});

describe("recess attendance", () => {
  it("moves short recess exits to its start and returns to its end", () => {
    const recess = { id: "break", mode: "track_exits" as const, startedAt: time(20), endedAt: time(40) };
    const events = bindEventsToRecess(
      [
        { ...event("first", "member", "in", 10), membershipTypeId: "old" },
        event("leave", "member", "out", 25),
        { ...event("return", "member", "in", 30), membershipTypeId: "new" },
      ],
      [recess],
    );
    const projected = projectMeetingEvents(events, [recess]);
    expect(meetingPresence(projected, time(19)).present).toEqual(["member"]);
    expect(meetingPresence(projected, time(20)).present).toEqual([]);
    expect(meetingPresence(projected, time(39)).present).toEqual([]);
    expect(meetingPresence(projected, time(40)).membershipTypeByAttendee.member).toBe("new");
    expect(meetingPhysicalPresence(events, [recess]).present).toEqual(["member"]);
  });

  it("rebuilds a long recess as a short recess after changing its mode", () => {
    const recess = { id: "break", mode: "reset_all" as const, startedAt: time(20), endedAt: time(40) };
    const events = bindEventsToRecess([event("first", "member", "in", 10)], [recess]);
    expect(meetingPresence(projectMeetingEvents(events, [recess]), time(30)).present).toEqual([]);
    expect(meetingPhysicalPresence(events, [recess]).present).toEqual([]);
    expect(
      meetingPresence(projectMeetingEvents(events, [{ ...recess, mode: "track_exits" }]), time(30)).present,
    ).toEqual(["member"]);
  });

  it("rebinds a corrected action when its time moves outside the recess", () => {
    const recess = { id: "break", mode: "track_exits" as const, startedAt: time(20), endedAt: time(40) };
    const events = bindEventsToRecess(
      [event("first", "member", "in", 10), event("leave", "member", "out", 25)],
      [recess],
    );
    const corrected = bindEventsToRecess(
      [{ ...events[0] }, { ...events[1], effectiveAt: time(45) }] as MeetingEvent[],
      [recess],
    );
    expect(events[1]?.recessId).toBe("break");
    expect(corrected[1]?.recessId).toBeNull();
    expect(meetingPresence(projectMeetingEvents(corrected, [recess]), time(30)).present).toEqual(["member"]);
  });
});
