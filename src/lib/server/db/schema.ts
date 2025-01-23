import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import * as z from "zod";

const timestamps = {
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(new Date()),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.default(new Date())
		.$onUpdateFn(() => new Date()),
};

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	isAdmin: boolean("is_admin").notNull().default(false),
	firstNames: text("first_names"),
	lastName: text("last_name"),
	homeMunicipality: text("home_municipality"),
	isAllowedEmails: boolean("is_allowed_emails").notNull().default(false),
	...timestamps,
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const emailOTP = pgTable("email_otp", {
	id: text("id").primaryKey(),
	code: text("code").notNull(),
	email: text("email").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

export const membership = pgTable("membership", {
	id: text("id").primaryKey(),
	type: text("type").notNull(), // todo l10n
	startTime: timestamp("start_time", { withTimezone: true, mode: "date" }).notNull(),
	endTime: timestamp("end_time", { withTimezone: true, mode: "date" }).notNull(),
	priceCents: integer("price").notNull().default(0),
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
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id),
	membershipId: text("membership_id")
		.notNull()
		.references(() => membership.id),
	status: memberStatusEnum("status").notNull(),
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
