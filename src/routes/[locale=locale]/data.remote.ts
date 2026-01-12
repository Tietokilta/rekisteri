import { fail, redirect } from "@sveltejs/kit";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { schema } from "./schema";
import * as z from "zod";
import { fi, en } from "zod/locales";
import { form, query, command, getRequestEvent } from "$app/server";
import * as auth from "$lib/server/auth/session";

// Query function to get user data
export const getUser = query(async () => {
	const event = getRequestEvent();

	if (!event.locals.user) {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	// Fetch fresh user data from database for display purposes
	// event.locals.user comes from session validation (for auth), but we want
	// the absolute latest data when the page loads/reloads (e.g., after form save)
	const [freshUser] = await db.select().from(table.user).where(eq(table.user.id, event.locals.user.id)).limit(1);

	if (!freshUser) {
		// User was deleted
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	return freshUser;
});

// Query function to get memberships
export const getMemberships = query(async () => {
	const event = getRequestEvent();

	if (!event.locals.user) {
		return [];
	}

	const result = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.startTime));

	return result.map((m) => ({
		...m.membership,
		status: m.member.status,
		unique_id: m.member.id,
	}));
});

// Form function for saving user info
export const saveUserInfo = form(schema, async (data) => {
	const event = getRequestEvent();

	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	// Configure Zod locale based on user's language preference
	z.config(event.locals.locale === "fi" ? fi() : en());

	try {
		await db
			.update(table.user)
			.set({
				// don't allow changing email here
				firstNames: data.firstNames,
				lastName: data.lastName,
				homeMunicipality: data.homeMunicipality,
				preferredLanguage: data.preferredLanguage,
				isAllowedEmails: data.isAllowedEmails,
			})
			.where(eq(table.user.id, event.locals.user.id));

		return { success: true };
	} catch {
		return fail(500, { success: false, message: "Failed to save information" });
	}
});

// Command function for signing out
export const signOut = command(async () => {
	const event = getRequestEvent();

	if (!event.locals.session) {
		return fail(401, {
			message: "Not authenticated",
		});
	}

	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
});
