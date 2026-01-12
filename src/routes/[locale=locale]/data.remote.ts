import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import * as auth from "$lib/server/auth/session";
import { route } from "$lib/ROUTES";
import * as z from "zod";
import { fi, en } from "zod/locales";
import { userInfoSchema } from "./schema";

export const saveUserInfo = form(userInfoSchema, async (data) => {
	const event = getRequestEvent();

	if (!event.locals.user) {
		error(401, "Unauthorized");
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
	} catch {
		error(500, "Failed to update user information");
	}
});

export const signOut = form(async () => {
	const event = getRequestEvent();

	if (!event.locals.session) {
		error(401, "Not authenticated");
	}

	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
});
