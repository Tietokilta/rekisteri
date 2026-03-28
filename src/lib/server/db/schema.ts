import { sql } from "drizzle-orm";
import {
  boolean,
  bytea,
  check,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import * as v from "valibot";

import { DEFAULT_CUSTOMISATION } from "../customisation/defaults";
import { ADMIN_ROLE_VALUES, MEMBER_STATUS_VALUES, PREFERRED_LANGUAGE_VALUES } from "../../shared/enums";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

export type LocalizedString = { fi: string; en: string };

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
};

export const adminRoleEnum = pgEnum("admin_role", ADMIN_ROLE_VALUES);

export const adminRoleEnumSchema = v.picklist(ADMIN_ROLE_VALUES);

export const preferredLanguageEnum = pgEnum("preferred_language", PREFERRED_LANGUAGE_VALUES);

export const preferredLanguageEnumSchema = v.picklist(PREFERRED_LANGUAGE_VALUES);

export const memberStatusEnum = pgEnum("member_status", MEMBER_STATUS_VALUES);

export const memberStatusEnumSchema = v.picklist(MEMBER_STATUS_VALUES);

export const user = pgTable("user", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  adminRole: adminRoleEnum().notNull().default("none"),
  firstNames: text(),
  lastName: text(),
  homeMunicipality: text(),
  preferredLanguage: preferredLanguageEnum().notNull().default("unspecified"),
  isAllowedEmails: boolean().notNull().default(false),
  stripeCustomerId: text(),
  qrToken: text().unique(), // Static QR token for member verification
  lastActiveAt: timestamp({ withTimezone: true }), // GDPR: tracks last user activity for cleanup
  ...timestamps,
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export const emailOTP = pgTable("email_otp", {
  id: text().primaryKey(),
  code: text().notNull(),
  email: text().notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
});

export const passkey = pgTable(
  "passkey",
  {
    id: text().primaryKey(), // credentialId from WebAuthn (base64url encoded)
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    publicKey: text().notNull(), // Public key for verification (base64url encoded)
    counter: integer().notNull().default(0), // Signature counter for replay protection
    deviceName: text(), // User-friendly device name (e.g., "iPhone 15", "YubiKey 5")
    transports: json().$type<AuthenticatorTransportFuture[]>(), // Authenticator transports
    backedUp: boolean().notNull().default(false), // Whether passkey is synced (e.g., iCloud Keychain)
    lastUsedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("idx_passkey_user_id").on(table.userId)],
);

export const secondaryEmail = pgTable(
  "secondary_email",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text().notNull(), // Uniqueness enforced via partial index on verified emails only
    domain: text().notNull(), // Extracted domain (e.g., "aalto.fi") for filtering
    verifiedAt: timestamp({ withTimezone: true }), // null if not yet verified
    expiresAt: timestamp({ withTimezone: true }), // null for domains that never expire
    ...timestamps,
  },
  (table) => [
    index("idx_secondary_email_user_id").on(table.userId),
    index("idx_secondary_email_domain").on(table.domain),
    // Each user can only have one record per email address
    uniqueIndex("unique_user_secondary_email").on(table.userId, table.email),
    // Partial unique index: only verified emails must be globally unique
    // This prevents email squatting - unverified emails don't block others
    uniqueIndex("unique_verified_secondary_email")
      .on(table.email)
      .where(sql`${table.verifiedAt} IS NOT NULL`),
  ],
);

export const membershipType = pgTable("membership_type", {
  id: text().primaryKey(),
  name: jsonb("name").$type<LocalizedString>().notNull(),
  description: jsonb("description").$type<LocalizedString>(),
  purchasable: boolean().notNull().default(true),
  ...timestamps,
});

export const membership = pgTable(
  "membership",
  {
    id: text().primaryKey(),
    membershipTypeId: text()
      .notNull()
      .references(() => membershipType.id),
    stripePriceId: text(), // null for legacy memberships (pre-2025)
    startTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    endTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
    requiresStudentVerification: boolean().notNull().default(false),
  },
  (table) => [uniqueIndex("membership_type_start_unique").on(table.membershipTypeId, table.startTime)],
);

export const member = pgTable(
  "member",
  {
    id: text().primaryKey(),
    userId: text().references(() => user.id),
    organizationName: text(),
    membershipId: text()
      .notNull()
      .references(() => membership.id),
    status: memberStatusEnum().notNull(),
    stripeSessionId: text(),
    description: text(),
    ...timestamps,
  },
  (table) => [
    // A member must have either userId (individual) or organizationName (association), not both
    check(
      "member_user_or_org",
      sql`(${table.userId} IS NOT NULL AND ${table.organizationName} IS NULL) OR (${table.userId} IS NULL AND ${table.organizationName} IS NOT NULL)`,
    ),
    index("member_user_id_idx").on(table.userId),
    index("member_membership_id_idx").on(table.membershipId),
    index("member_status_idx").on(table.status),
  ],
);

export const auditLog = pgTable("audit_log", {
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

export const appCustomisation = pgTable("app_customisation", {
  id: integer().primaryKey().default(1),
  accentColor: text().notNull().default(DEFAULT_CUSTOMISATION.accentColor),
  organizationName: jsonb().$type<LocalizedString>().notNull().default(DEFAULT_CUSTOMISATION.organizationName),
  appName: jsonb().$type<LocalizedString>().notNull().default(DEFAULT_CUSTOMISATION.appName),
  logo: bytea(),
  logoDark: bytea(),
  favicon: bytea(),
  faviconDark: bytea(),
  businessId: text().notNull().default(DEFAULT_CUSTOMISATION.businessId),
  overseerContact: text().notNull().default(DEFAULT_CUSTOMISATION.overseerContact),
  overseerAddress: text().notNull().default(DEFAULT_CUSTOMISATION.overseerAddress),
  privacyPolicy: jsonb().$type<LocalizedString>().notNull().default(DEFAULT_CUSTOMISATION.privacyPolicy),
  organizationRulesUrl: text().notNull().default(DEFAULT_CUSTOMISATION.organizationRulesUrl),
  memberResignRule: text().default(DEFAULT_CUSTOMISATION.memberResignRule),
  memberResignDefaultReason: jsonb().$type<LocalizedString>().default(DEFAULT_CUSTOMISATION.memberResignDefaultReason),
  ...timestamps,
});

export type Member = typeof member.$inferSelect;

export type MemberStatus = v.InferOutput<typeof memberStatusEnumSchema>;

export type PreferredLanguage = v.InferOutput<typeof preferredLanguageEnumSchema>;

export type AdminRole = v.InferOutput<typeof adminRoleEnumSchema>;

export type MembershipType = typeof membershipType.$inferSelect;

export type Membership = typeof membership.$inferSelect;

export type EmailOTP = typeof emailOTP.$inferSelect;

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export type AuditLog = typeof auditLog.$inferSelect;

export type Passkey = typeof passkey.$inferSelect;

export type SecondaryEmail = typeof secondaryEmail.$inferSelect;

export type AppCustomisation = typeof appCustomisation.$inferSelect;
