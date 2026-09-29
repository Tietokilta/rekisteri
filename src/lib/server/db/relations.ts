import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    members: r.many.member({ from: r.user.id, to: r.member.userId }),
    sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
    passkeys: r.many.passkey({ from: r.user.id, to: r.passkey.userId }),
    secondaryEmails: r.many.secondaryEmail({ from: r.user.id, to: r.secondaryEmail.userId }),
    auditLogs: r.many.auditLog({ from: r.user.id, to: r.auditLog.userId }),
    meetingAttendees: r.many.meetingAttendee({ from: r.user.id, to: r.meetingAttendee.userId }),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false }),
  },
  passkey: {
    user: r.one.user({ from: r.passkey.userId, to: r.user.id, optional: false }),
  },
  secondaryEmail: {
    user: r.one.user({ from: r.secondaryEmail.userId, to: r.user.id, optional: false }),
  },
  membershipType: {
    memberships: r.many.membership({ from: r.membershipType.id, to: r.membership.membershipTypeId }),
  },
  membership: {
    membershipType: r.one.membershipType({
      from: r.membership.membershipTypeId,
      to: r.membershipType.id,
      optional: false,
    }),
    members: r.many.member({ from: r.membership.id, to: r.member.membershipId }),
  },
  member: {
    user: r.one.user({ from: r.member.userId, to: r.user.id }),
    membership: r.one.membership({
      from: r.member.membershipId,
      to: r.membership.id,
      optional: false,
    }),
  },
  auditLog: {
    user: r.one.user({ from: r.auditLog.userId, to: r.user.id }),
  },
  meeting: {
    attendees: r.many.meetingAttendee({ from: r.meeting.id, to: r.meetingAttendee.meetingId }),
    events: r.many.meetingAttendanceEvent({ from: r.meeting.id, to: r.meetingAttendanceEvent.meetingId }),
    recesses: r.many.meetingRecess({ from: r.meeting.id, to: r.meetingRecess.meetingId }),
  },
  meetingRecess: {
    meeting: r.one.meeting({ from: r.meetingRecess.meetingId, to: r.meeting.id, optional: false }),
  },
  meetingAttendee: {
    meeting: r.one.meeting({ from: r.meetingAttendee.meetingId, to: r.meeting.id, optional: false }),
    user: r.one.user({ from: r.meetingAttendee.userId, to: r.user.id }),
    events: r.many.meetingAttendanceEvent({
      from: r.meetingAttendee.id,
      to: r.meetingAttendanceEvent.attendeeId,
    }),
  },
  meetingAttendanceEvent: {
    meeting: r.one.meeting({
      from: r.meetingAttendanceEvent.meetingId,
      to: r.meeting.id,
      optional: false,
    }),
    attendee: r.one.meetingAttendee({
      from: r.meetingAttendanceEvent.attendeeId,
      to: r.meetingAttendee.id,
      optional: false,
    }),
    corrections: r.many.meetingAttendanceEventCorrection({
      from: r.meetingAttendanceEvent.id,
      to: r.meetingAttendanceEventCorrection.eventId,
    }),
  },
  meetingAttendanceEventCorrection: {
    event: r.one.meetingAttendanceEvent({
      from: r.meetingAttendanceEventCorrection.eventId,
      to: r.meetingAttendanceEvent.id,
      optional: false,
    }),
  },
}));
