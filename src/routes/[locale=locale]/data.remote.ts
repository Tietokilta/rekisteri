import { fail, redirect } from "@sveltejs/kit";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { schema } from "./schema";
import * as z from "zod";
import { fi, en } from "zod/locales";
import { form, getRequestEvent } from "$app/server";
import * as auth from "$lib/server/auth/session";

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

// Form function for signing out
export const signOut = form(z.object({}), async () => {
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
