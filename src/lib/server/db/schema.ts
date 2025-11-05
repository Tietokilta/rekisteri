import { relations } from "drizzle-orm";
import { boolean, integer, json, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as z from "zod";

const timestamps = {
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
};

export const preferredLanguageEnum = pgEnum("preferred_language", [
	"unspecified",
	"finnish",
	"english",
]);

export const preferredLanguageEnumSchema = z.enum(preferredLanguageEnum.enumValues);

export const memberStatusEnum = pgEnum("member_status", [
	"awaiting_payment",
	"awaiting_approval",
	"active",
	"expired",
	"cancelled",
]);

export const memberStatusEnumSchema = z.enum(memberStatusEnum.enumValues);

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

export const membership = pgTable("membership", {
	id: text().primaryKey(),
	type: text().notNull(), // todo l10n
	stripePriceId: text().notNull(),
	startTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
	endTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
	priceCents: integer().notNull().default(0),
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

export type MemberStatus = z.infer<typeof memberStatusEnumSchema>;

export type PreferredLanguage = z.infer<typeof preferredLanguageEnumSchema>;

export type Membership = typeof membership.$inferSelect;

export type EmailOTP = typeof emailOTP.$inferSelect;

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export type AuditLog = typeof auditLog.$inferSelect;
