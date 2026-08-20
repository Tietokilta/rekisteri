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
  oidcClient: {
    consents: r.many.oidcConsent({ from: r.oidcClient.clientId, to: r.oidcConsent.clientId }),
    entities: r.many.oidcEntity({ from: r.oidcClient.clientId, to: r.oidcEntity.clientId }),
  },
  oidcConsent: {
    user: r.one.user({ from: r.oidcConsent.userId, to: r.user.id }),

    client: r.one.oidcClient({ from: r.oidcConsent.clientId, to: r.oidcClient.clientId }),

    entities: r.many.oidcEntity({ from: r.oidcConsent.id, to: r.oidcEntity.consentId }),
  },
  oidcEntity: {
    consent: r.one.oidcConsent({ from: r.oidcEntity.consentId, to: r.oidcConsent.id }),

    client: r.one.oidcClient({ from: r.oidcEntity.clientId, to: r.oidcClient.clientId }),
  },
}));
