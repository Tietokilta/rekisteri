import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  bytea,
  check,
  date,
  foreignKey,
  index,
  integer,
  json,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { ADMIN_ROLE_VALUES, PREFERRED_LANGUAGE_VALUES } from "../../shared/enums";
import {
  MEMBERSHIP_EVENT_CERTAINTY_VALUES,
  MEMBERSHIP_EVENT_SOURCE_VALUES,
  MEMBERSHIP_EVENT_TYPE_VALUES,
  MEMBERSHIP_OBLIGATION_DISPOSITION_VALUES,
  MEMBERSHIP_OBLIGATION_KIND_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  PAYMENT_REFUND_REASON_VALUES,
  PAYMENT_SOURCE_VALUES,
  PAYMENT_STATUS_VALUES,
  type MembershipEventData,
} from "../membership/model";

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
export const membershipStatusEnum = pgEnum("member_status", MEMBERSHIP_STATUS_VALUES);
export const membershipEventTypeEnum = pgEnum("membership_event_type", MEMBERSHIP_EVENT_TYPE_VALUES);
export const membershipEventSourceEnum = pgEnum("membership_event_source", MEMBERSHIP_EVENT_SOURCE_VALUES);
export const membershipEventCertaintyEnum = pgEnum("membership_event_certainty", MEMBERSHIP_EVENT_CERTAINTY_VALUES);
export const membershipObligationKindEnum = pgEnum("membership_obligation_kind", MEMBERSHIP_OBLIGATION_KIND_VALUES);
export const membershipObligationDispositionEnum = pgEnum(
  "membership_obligation_disposition",
  MEMBERSHIP_OBLIGATION_DISPOSITION_VALUES,
);
export const paymentSourceEnum = pgEnum("payment_source", PAYMENT_SOURCE_VALUES);
export const paymentStatusEnum = pgEnum("payment_status", PAYMENT_STATUS_VALUES);
export const paymentRefundReasonEnum = pgEnum("payment_refund_reason", PAYMENT_REFUND_REASON_VALUES);

export const membershipType = snakeCase.table(
  "membership_type",
  {
    id: text().primaryKey(),
    name: jsonb().$type<LocalizedString>().notNull(),
    description: jsonb().$type<LocalizedString>(),
    purchasable: boolean().notNull().default(true),
    requiresPayment: boolean().notNull().default(true),
    requiresStudentVerification: boolean().notNull().default(false),
    legacyInferenceThroughPeriodId: text().references((): AnyPgColumn => membershipFeePeriod.id),
    ...timestamps,
  },
  (table) => [index("membership_type_legacy_inference_period_idx").on(table.legacyInferenceThroughPeriodId)],
);

export const membershipFeePeriod = snakeCase.table(
  "membership_fee_period",
  {
    id: text().primaryKey(),
    membershipTypeId: text()
      .notNull()
      .references(() => membershipType.id),
    startDate: date().notNull(),
    endDate: date().notNull(),
    dueDate: date().notNull(),
    nonPaymentActionAt: date().notNull(),
    stripePriceId: text(),
    publishedAt: timestamp({ withTimezone: true }),
    acceptsApplications: boolean().notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("membership_fee_period_type_start_unique").on(table.membershipTypeId, table.startDate),
    uniqueIndex("membership_fee_period_application_target_unique")
      .on(table.membershipTypeId)
      .where(sql`${table.acceptsApplications}`),
    index("membership_fee_period_type_idx").on(table.membershipTypeId),
    check("membership_fee_period_date_order", sql`${table.endDate} >= ${table.startDate}`),
    check("membership_fee_period_action_after_due", sql`${table.nonPaymentActionAt} > ${table.dueDate}`),
    check(
      "membership_fee_period_application_target_published",
      sql`NOT ${table.acceptsApplications} OR ${table.publishedAt} IS NOT NULL`,
    ),
  ],
);

export const member = snakeCase.table(
  "member",
  {
    id: text().primaryKey(),
    userId: text().references(() => user.id),
    organizationName: text(),
    status: membershipStatusEnum().notNull(),
    membershipTypeId: text().references(() => membershipType.id),
    pendingMembershipTypeId: text().references(() => membershipType.id),
    currentMembershipStartedAt: timestamp({ withTimezone: true }),
    currentMembershipEndedAt: timestamp({ withTimezone: true }),
    applicationMotive: text(),
    ...timestamps,
  },
  (table) => [
    check(
      "member_user_or_org",
      sql`(${table.userId} IS NOT NULL AND ${table.organizationName} IS NULL) OR (${table.userId} IS NULL AND ${table.organizationName} IS NOT NULL)`,
    ),
    check(
      "member_membership_date_order",
      sql`${table.currentMembershipEndedAt} IS NULL OR (${table.currentMembershipStartedAt} IS NOT NULL AND ${table.currentMembershipEndedAt} >= ${table.currentMembershipStartedAt})`,
    ),
    check(
      "member_active_snapshot",
      sql`${table.status} <> 'active' OR (${table.membershipTypeId} IS NOT NULL AND ${table.currentMembershipStartedAt} IS NOT NULL AND ${table.currentMembershipEndedAt} IS NULL)`,
    ),
    check(
      "member_ended_snapshot",
      sql`${table.status} <> 'ended' OR (${table.membershipTypeId} IS NOT NULL AND ${table.currentMembershipStartedAt} IS NOT NULL AND ${table.currentMembershipEndedAt} IS NOT NULL)`,
    ),
    check(
      "member_pending_application_type",
      sql`${table.status} NOT IN ('awaiting_payment', 'awaiting_approval') OR ${table.pendingMembershipTypeId} IS NOT NULL`,
    ),
    uniqueIndex("member_user_id_unique").on(table.userId),
    index("member_status_idx").on(table.status),
    index("member_membership_type_idx").on(table.membershipTypeId),
    index("member_pending_membership_type_idx").on(table.pendingMembershipTypeId),
  ],
);

export const membershipEvent = snakeCase.table(
  "membership_event",
  {
    id: text().primaryKey(),
    memberId: text()
      .notNull()
      .references(() => member.id),
    eventType: membershipEventTypeEnum().notNull(),
    effectiveAt: timestamp({ withTimezone: true }).notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    source: membershipEventSourceEnum().notNull(),
    certainty: membershipEventCertaintyEnum().notNull(),
    actorUserId: text().references(() => user.id),
    relatedEventId: text().references((): AnyPgColumn => membershipEvent.id),
    membershipFeePeriodId: text().references(() => membershipFeePeriod.id),
    data: jsonb().$type<MembershipEventData>().notNull(),
  },
  (table) => [
    index("membership_event_member_timeline_idx").on(table.memberId, table.effectiveAt, table.recordedAt),
    index("membership_event_actor_idx").on(table.actorUserId),
    index("membership_event_fee_period_idx").on(table.membershipFeePeriodId),
    check(
      "membership_event_inferred_provenance",
      sql`${table.certainty} <> 'inferred' OR ${table.source} IN ('imported', 'migration')`,
    ),
    check(
      "membership_event_type_certainty",
      sql`(${table.eventType} IN ('legacy_membership_started_inferred', 'legacy_resignation_inferred', 'legacy_rejoin_inferred', 'legacy_type_changed_inferred') AND ${table.certainty} = 'inferred') OR (${table.eventType} NOT IN ('legacy_membership_started_inferred', 'legacy_resignation_inferred', 'legacy_rejoin_inferred', 'legacy_type_changed_inferred') AND ${table.certainty} = 'confirmed')`,
    ),
    check(
      "membership_event_correction_reference",
      sql`${table.eventType} <> 'membership_decision_corrected' OR ${table.relatedEventId} IS NOT NULL`,
    ),
  ],
);

export const membershipObligation = snakeCase.table(
  "membership_obligation",
  {
    id: text().primaryKey(),
    memberId: text()
      .notNull()
      .references(() => member.id),
    membershipFeePeriodId: text()
      .notNull()
      .references(() => membershipFeePeriod.id),
    kind: membershipObligationKindEnum().notNull(),
    disposition: membershipObligationDispositionEnum().notNull().default("required"),
    dispositionReason: text(),
    ...timestamps,
  },
  (table) => [
    unique("membership_obligation_member_period_unique").on(table.memberId, table.membershipFeePeriodId),
    unique("membership_obligation_payment_target_unique").on(table.id, table.memberId, table.membershipFeePeriodId),
    index("membership_obligation_disposition_idx").on(table.disposition),
    check(
      "membership_obligation_waiver_reason",
      sql`${table.disposition} <> 'waived' OR ${table.dispositionReason} IS NOT NULL`,
    ),
  ],
);

export const payment = snakeCase.table(
  "payment",
  {
    id: text().primaryKey(),
    memberId: text()
      .notNull()
      .references(() => member.id),
    membershipFeePeriodId: text()
      .notNull()
      .references(() => membershipFeePeriod.id),
    obligationId: text(),
    source: paymentSourceEnum().notNull(),
    status: paymentStatusEnum().notNull(),
    amount: integer(),
    currency: text(),
    paidAt: timestamp({ withTimezone: true }),
    stripeSessionId: text().unique(),
    stripePaymentIntentId: text().unique(),
    refundRequiredAt: timestamp({ withTimezone: true }),
    refundReason: paymentRefundReasonEnum(),
    refundConfirmedAt: timestamp({ withTimezone: true }),
    stripeRefundId: text().unique(),
    manualRefundReference: text(),
    invalidatedAt: timestamp({ withTimezone: true }),
    invalidationReason: text(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: "payment_obligation_member_period_fk",
      columns: [table.obligationId, table.memberId, table.membershipFeePeriodId],
      foreignColumns: [
        membershipObligation.id,
        membershipObligation.memberId,
        membershipObligation.membershipFeePeriodId,
      ],
    }),
    uniqueIndex("payment_pending_obligation_unique")
      .on(table.obligationId)
      .where(sql`${table.status} = 'pending' AND ${table.obligationId} IS NOT NULL`),
    index("payment_member_idx").on(table.memberId),
    index("payment_fee_period_idx").on(table.membershipFeePeriodId),
    index("payment_refund_required_idx").on(table.refundRequiredAt),
    check("payment_amount_nonnegative", sql`${table.amount} IS NULL OR ${table.amount} >= 0`),
    check(
      "payment_refund_reason_required",
      sql`${table.refundRequiredAt} IS NULL OR ${table.refundReason} IS NOT NULL`,
    ),
    check(
      "payment_refund_confirmation_requires_request",
      sql`${table.refundConfirmedAt} IS NULL OR ${table.refundRequiredAt} IS NOT NULL`,
    ),
    check(
      "payment_manual_refund_reference",
      sql`${table.refundConfirmedAt} IS NULL OR ${table.source} = 'stripe' OR ${table.manualRefundReference} IS NOT NULL`,
    ),
    check(
      "payment_invalidation_reason",
      sql`${table.invalidatedAt} IS NULL OR ${table.invalidationReason} IS NOT NULL`,
    ),
  ],
);

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
    organizationRulesUrl: jsonb().$type<LocalizedString>().notNull(),
    memberResignRule: text().notNull(),
    memberResignDefaultReason: jsonb().$type<LocalizedString>().notNull(),
    membershipDataLiveAt: timestamp({ withTimezone: true }),
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

export type AppCustomization = typeof appCustomization.$inferSelect;
export type Member = typeof member.$inferSelect;
export type MembershipFeePeriod = typeof membershipFeePeriod.$inferSelect;
export type MembershipType = typeof membershipType.$inferSelect;
