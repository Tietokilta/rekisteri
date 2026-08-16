import { sql } from "drizzle-orm";
import { boolean, index, integer, json, pgEnum, snakeCase, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { ADMIN_ROLE_VALUES, PREFERRED_LANGUAGE_VALUES } from "../../shared/enums";

export type LocalizedString = { fi: string; en: string };

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};

export const adminRoleEnum = pgEnum("admin_role", ADMIN_ROLE_VALUES);
export const preferredLanguageEnum = pgEnum("preferred_language", PREFERRED_LANGUAGE_VALUES);

export const user = snakeCase.table("user", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  adminRole: adminRoleEnum().notNull().default("none"),
  firstNames: text(),
  lastName: text(),
  homeMunicipality: text(),
  preferredLanguage: preferredLanguageEnum().notNull().default("unspecified"),
  isAllowedEmails: boolean().notNull().default(false),
  stripeCustomerId: text(),
  qrToken: text().unique(),
  lastActiveAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const session = snakeCase.table("session", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export const emailOTP = snakeCase.table("email_otp", {
  id: text().primaryKey(),
  code: text().notNull(),
  email: text().notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export const passkey = snakeCase.table(
  "passkey",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publicKey: text().notNull(),
    counter: integer().notNull().default(0),
    deviceName: text(),
    transports: json().$type<AuthenticatorTransportFuture[]>(),
    backedUp: boolean().notNull().default(false),
    lastUsedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("idx_passkey_user_id").on(table.userId)],
);

export const secondaryEmail = snakeCase.table(
  "secondary_email",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text().notNull(),
    domain: text().notNull(),
    verifiedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("idx_secondary_email_user_id").on(table.userId),
    index("idx_secondary_email_domain").on(table.domain),
    uniqueIndex("unique_user_secondary_email").on(table.userId, table.email),
    uniqueIndex("unique_verified_secondary_email")
      .on(table.email)
      .where(sql`${table.verifiedAt} IS NOT NULL`),
  ],
);

export const auditLog = snakeCase.table("audit_log", {
  id: text().primaryKey(),
  userId: text().references(() => user.id),
  action: text().notNull(),
  targetType: text(),
  targetId: text(),
  metadata: json(),
  ipAddress: text(),
  userAgent: text(),
  ...timestamps,
});

export type AuditLog = typeof auditLog.$inferSelect;
export type EmailOTP = typeof emailOTP.$inferSelect;
export type Passkey = typeof passkey.$inferSelect;
export type SecondaryEmail = typeof secondaryEmail.$inferSelect;
export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
