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
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import * as v from "valibot";

import {
  ADMIN_ROLE_VALUES,
  MEMBER_STATUS_VALUES,
  OIDC_GRANT_TYPE_VALUES,
  PREFERRED_LANGUAGE_VALUES,
} from "../../shared/enums";
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

export const oidcGrantTypeEnum = pgEnum("oidc_grant_type", OIDC_GRANT_TYPE_VALUES);

export const oidcGrantTypeEnumSchema = v.picklist(OIDC_GRANT_TYPE_VALUES);

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
  qrToken: text().unique(), // Static QR token for member verification
  lastActiveAt: timestamp({ withTimezone: true }), // GDPR: tracks last user activity for cleanup
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

export const secondaryEmail = snakeCase.table(
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

export const membershipType = snakeCase.table("membership_type", {
  id: text().primaryKey(),
  name: jsonb("name").$type<LocalizedString>().notNull(),
  description: jsonb("description").$type<LocalizedString>(),
  purchasable: boolean().notNull().default(true),
  ...timestamps,
});

export const membership = snakeCase.table(
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

export const member = snakeCase.table(
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

export const appCustomization = snakeCase.table(
  "app_customization",
  {
    id: integer().primaryKey(),
    accentColor: text(),
    organizationName: jsonb().$type<LocalizedString>().notNull(),
    organizationLegalName: jsonb().$type<LocalizedString>().notNull(),
    appName: jsonb().$type<LocalizedString>().notNull(),
    logo: bytea(),
    logoDark: bytea(),
    favicon: bytea(),
    faviconDark: bytea(),
    businessId: text().notNull(),
    overseerContact: text().notNull(),
    overseerAddress: text().notNull(),
    privacyPolicy: jsonb().$type<LocalizedString>().notNull(),
    organizationRulesUrl: text().notNull(),
    memberResignRule: text().notNull(),
    memberResignDefaultReason: jsonb().$type<LocalizedString>().notNull(),
    ...timestamps,
  },
  (table) => [
    check("app_customization_singleton", sql`${table.id} = 1`),
    check("app_customization_logo_size", sql`octet_length(${table.logo}) <= ${64 * 1024}`),
    check("app_customization_logo_dark_size", sql`octet_length(${table.logoDark}) <= ${64 * 1024}`),
    check("app_customization_favicon_size", sql`octet_length(${table.favicon}) <= ${32 * 1024}`),
    check("app_customization_favicon_dark_size", sql`octet_length(${table.faviconDark}) <= ${32 * 1024}`),
  ],
);

export const oidcClient = snakeCase.table("oidc_client", {
  clientId: text().primaryKey(),
  clientSecret: text().notNull(),
  type: oidcGrantTypeEnum().notNull().default("authorization_code"),
  name: text().notNull(),
  allowedOrigins: jsonb().$type<string[]>().notNull().default([]),
  redirectUris: jsonb().$type<string[]>().notNull().default([]),
  scopes: jsonb().$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const oidcConsent = snakeCase.table(
  "oidc_consent",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text()
      .notNull()
      .references(() => oidcClient.clientId, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("unique_user_client_consent").on(table.userId, table.clientId),
    index("idx_oidc_consent_user_id").on(table.userId),
    index("idx_oidc_consent_client_id").on(table.clientId),
  ],
);

export const oidcEntity = snakeCase.table(
  "oidc_entity",
  {
    jti: text().primaryKey(), // Interaction, refresh_token, authorization_code, Session, or Grant JTI
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    consentId: text().references(() => oidcConsent.id, { onDelete: "cascade" }),
    clientId: text().references(() => oidcClient.clientId, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    index("idx_oidc_entity_consent_id").on(table.consentId),
    index("idx_oidc_entity_client_id").on(table.clientId),
    index("idx_oidc_entity_expires_at").on(table.expiresAt),
  ],
);

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

export type AppCustomization = typeof appCustomization.$inferSelect;

export type OidcClient = typeof oidcClient.$inferSelect;

export type OidcConsent = typeof oidcConsent.$inferSelect;

export type OidcEntity = typeof oidcEntity.$inferSelect;

export type OidcGrantType = v.InferOutput<typeof oidcGrantTypeEnumSchema>;
