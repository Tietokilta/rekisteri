import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	isAdmin: boolean("is_admin").notNull().default(false),
	firstNames: text("first_names"),
	lastName: text("last_name"),
	homeMunicipality: text("home_municipality"),
	isAllowedEmails: boolean("is_allowed_emails").notNull().default(false),
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

export type EmailOTP = typeof emailOTP.$inferSelect;

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;
