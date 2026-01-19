import { relations, sql } from "drizzle-orm";
import {
	boolean,
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
import { MEMBER_STATUS_VALUES, PREFERRED_LANGUAGE_VALUES } from "../../shared/enums";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

export type LocalizedString = { fi: string; en: string };

const timestamps = {
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
};

export const preferredLanguageEnum = pgEnum("preferred_language", PREFERRED_LANGUAGE_VALUES);

export const preferredLanguageEnumSchema = v.picklist(PREFERRED_LANGUAGE_VALUES);

export const memberStatusEnum = pgEnum("member_status", MEMBER_STATUS_VALUES);

export const memberStatusEnumSchema = v.picklist(MEMBER_STATUS_VALUES);

export const user = pgTable("user", {
	id: text().primaryKey(),
	email: text().notNull().unique(),
	isAdmin: boolean().notNull().default(false),
	firstNames: text(),
	lastName: text(),
	homeMunicipality: text(),
	preferredLanguage: preferredLanguageEnum().notNull().default("unspecified"),
	isAllowedEmails: boolean().notNull().default(false),
	stripeCustomerId: text(),
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
	...timestamps,
});

export const membership = pgTable("membership", {
	id: text().primaryKey(),
	membershipTypeId: text()
		.notNull()
		.references(() => membershipType.id),
	stripePriceId: text(), // null for legacy memberships (pre-2025)
	startTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
	endTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
	requiresStudentVerification: boolean().notNull().default(false),
});

export const member = pgTable("member", {
	id: text().primaryKey(),
	userId: text()
		.notNull()
		.references(() => user.id),
	membershipId: text()
		.notNull()
		.references(() => membership.id),
	status: memberStatusEnum().notNull(),
	stripeSessionId: text(),
	...timestamps,
});

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

export type Member = typeof member.$inferSelect;

export type MemberStatus = v.InferOutput<typeof memberStatusEnumSchema>;

export type PreferredLanguage = v.InferOutput<typeof preferredLanguageEnumSchema>;

export type MembershipType = typeof membershipType.$inferSelect;

export type Membership = typeof membership.$inferSelect;

export type EmailOTP = typeof emailOTP.$inferSelect;

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export type AuditLog = typeof auditLog.$inferSelect;

export type Passkey = typeof passkey.$inferSelect;

export type SecondaryEmail = typeof secondaryEmail.$inferSelect;
