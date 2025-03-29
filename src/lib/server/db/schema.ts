import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as z from "zod";

const timestamps = {
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
};

export const user = pgTable("user", {
	id: text().primaryKey(),
	email: text().notNull().unique(),
	isAdmin: boolean().notNull().default(false),
	firstNames: text(),
	lastName: text(),
	homeMunicipality: text(),
	isAllowedEmails: boolean().notNull().default(false),
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
	stripeProductId: text().notNull(),
	startTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
	endTime: timestamp({ withTimezone: true, mode: "date" }).notNull(),
	priceCents: integer().notNull().default(0),
});

export const memberStatusEnum = pgEnum("member_status", [
	"awaiting_payment",
	"awaiting_approval",
	"active",
	"expired",
	"cancelled",
]);

export const memberStatusEnumSchema = z.enum(memberStatusEnum.enumValues);

export const member = pgTable("member", {
	id: text().primaryKey(),
	userId: text()
		.notNull()
		.references(() => user.id),
	membershipId: text()
		.notNull()
		.references(() => membership.id),
	status: memberStatusEnum().notNull(),
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

export type Member = typeof member.$inferSelect;

export type MemberStatus = z.infer<typeof memberStatusEnumSchema>;

export type Membership = typeof membership.$inferSelect;

export type EmailOTP = typeof emailOTP.$inferSelect;

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;
