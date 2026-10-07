import * as v from "valibot";

const id = v.pipe(v.string(), v.minLength(1));
/** Client-generated so a retried request records the action only once. */
const eventId = v.pipe(v.string(), v.uuid());
const direction = v.picklist(["in", "out"]);
const recessMode = v.picklist(["track_exits", "reset_all"]);
const reason = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500));
/** ISO 8601 timestamp with an explicit offset, as produced by `Date.prototype.toISOString`. */
const isoDateTime = v.pipe(
  v.string(),
  v.regex(/(Z|[+-]\d\d:\d\d)$/, "Invalid time"),
  v.check((value) => !Number.isNaN(Date.parse(value)), "Invalid time"),
);
const optionalIsoDateTime = v.optional(v.union([v.literal(""), isoDateTime]), "");

export const createMeetingSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  scheduledStartsAt: isoDateTime,
});

export const updateMeetingTimesSchema = v.object({
  meetingId: id,
  scheduledStartsAt: isoDateTime,
  startsAt: optionalIsoDateTime,
});

export const meetingIdSchema = v.object({ meetingId: id });

export const startRecessSchema = v.object({ meetingId: id, mode: recessMode });

export const recordAttendanceSchema = v.object({
  meetingId: id,
  eventId,
  direction,
  attendeeId: v.optional(v.string()),
  userId: v.optional(v.string()),
  guestName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
});

export const scanAttendanceSchema = v.object({
  meetingId: id,
  eventId,
  direction,
  token: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
});

export const addMissedActionSchema = v.object({
  meetingId: id,
  eventId,
  attendeeId: id,
  direction,
  effectiveAt: isoDateTime,
  note: reason,
});

export const correctEventSchema = v.object({
  meetingId: id,
  eventId: id,
  operation: v.picklist(["replace", "void", "restore"]),
  attendeeId: id,
  direction,
  effectiveAt: isoDateTime,
  reason,
});

export const quickCorrectEventSchema = v.object({
  meetingId: id,
  eventId: id,
  operation: v.picklist(["void", "restore"]),
  reason,
});

export const editRecessSchema = v.object({
  meetingId: id,
  recessId: id,
  mode: recessMode,
  startedAt: isoDateTime,
  endedAt: optionalIsoDateTime,
  cancelled: v.picklist(["true", "false"]),
  reason,
});

/** Exactly one of `userId` (link to a member) or `guestName` (a named guest) is set by the form. */
export const updateAttendeeSchema = v.pipe(
  v.object({
    meetingId: id,
    attendeeId: id,
    userId: v.optional(v.string(), ""),
    guestName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""),
    reason,
  }),
  v.check((data) => Boolean(data.userId) !== Boolean(data.guestName), "Choose a member or enter a guest name"),
);
