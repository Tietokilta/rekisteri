import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    members: r.many.member({ from: r.user.id, to: r.member.userId }),
    sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
    passkeys: r.many.passkey({ from: r.user.id, to: r.passkey.userId }),
    secondaryEmails: r.many.secondaryEmail({ from: r.user.id, to: r.secondaryEmail.userId }),
    auditLogs: r.many.auditLog({ from: r.user.id, to: r.auditLog.userId }),
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
    feePeriods: r.many.membershipFeePeriod({
      from: r.membershipType.id,
      to: r.membershipFeePeriod.membershipTypeId,
    }),
    members: r.many.member({ from: r.membershipType.id, to: r.member.membershipTypeId }),
    pendingMembers: r.many.member({
      from: r.membershipType.id,
      to: r.member.pendingMembershipTypeId,
      alias: "pendingMembershipType",
    }),
  },
  membershipFeePeriod: {
    membershipType: r.one.membershipType({
      from: r.membershipFeePeriod.membershipTypeId,
      to: r.membershipType.id,
      optional: false,
    }),
    events: r.many.membershipEvent({ from: r.membershipFeePeriod.id, to: r.membershipEvent.membershipFeePeriodId }),
    obligations: r.many.membershipObligation({
      from: r.membershipFeePeriod.id,
      to: r.membershipObligation.membershipFeePeriodId,
    }),
    payments: r.many.payment({ from: r.membershipFeePeriod.id, to: r.payment.membershipFeePeriodId }),
  },
  member: {
    user: r.one.user({ from: r.member.userId, to: r.user.id }),
    membershipType: r.one.membershipType({
      from: r.member.membershipTypeId,
      to: r.membershipType.id,
    }),
    pendingMembershipType: r.one.membershipType({
      from: r.member.pendingMembershipTypeId,
      to: r.membershipType.id,
      alias: "pendingMembershipType",
    }),
    events: r.many.membershipEvent({ from: r.member.id, to: r.membershipEvent.memberId }),
    obligations: r.many.membershipObligation({ from: r.member.id, to: r.membershipObligation.memberId }),
    payments: r.many.payment({ from: r.member.id, to: r.payment.memberId }),
  },
  membershipEvent: {
    member: r.one.member({ from: r.membershipEvent.memberId, to: r.member.id, optional: false }),
    actor: r.one.user({ from: r.membershipEvent.actorUserId, to: r.user.id }),
    feePeriod: r.one.membershipFeePeriod({
      from: r.membershipEvent.membershipFeePeriodId,
      to: r.membershipFeePeriod.id,
    }),
    relatedEvent: r.one.membershipEvent({
      from: r.membershipEvent.relatedEventId,
      to: r.membershipEvent.id,
      alias: "relatedEvent",
    }),
  },
  membershipObligation: {
    member: r.one.member({ from: r.membershipObligation.memberId, to: r.member.id, optional: false }),
    feePeriod: r.one.membershipFeePeriod({
      from: r.membershipObligation.membershipFeePeriodId,
      to: r.membershipFeePeriod.id,
      optional: false,
    }),
    payments: r.many.payment({ from: r.membershipObligation.id, to: r.payment.obligationId }),
  },
  payment: {
    member: r.one.member({ from: r.payment.memberId, to: r.member.id, optional: false }),
    feePeriod: r.one.membershipFeePeriod({
      from: r.payment.membershipFeePeriodId,
      to: r.membershipFeePeriod.id,
      optional: false,
    }),
    obligation: r.one.membershipObligation({ from: r.payment.obligationId, to: r.membershipObligation.id }),
  },
  auditLog: {
    user: r.one.user({ from: r.auditLog.userId, to: r.user.id }),
  },
}));
