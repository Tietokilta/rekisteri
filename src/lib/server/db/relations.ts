import { relations } from "drizzle-orm/_relations";
import { user, session, passkey, secondaryEmail, membershipType, membership, member, auditLog } from "./schema";

export const userRelations = relations(user, ({ many }) => ({
  members: many(member),
  sessions: many(session),
  passkeys: many(passkey),
  secondaryEmails: many(secondaryEmail),
  auditLogs: many(auditLog),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}));

export const secondaryEmailRelations = relations(secondaryEmail, ({ one }) => ({
  user: one(user, {
    fields: [secondaryEmail.userId],
    references: [user.id],
  }),
}));

export const membershipTypeRelations = relations(membershipType, ({ many }) => ({
  memberships: many(membership),
}));

export const membershipRelations = relations(membership, ({ one, many }) => ({
  membershipType: one(membershipType, {
    fields: [membership.membershipTypeId],
    references: [membershipType.id],
  }),
  members: many(member),
}));

export const memberRelations = relations(member, ({ one }) => ({
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
  membership: one(membership, {
    fields: [member.membershipId],
    references: [membership.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
}));
