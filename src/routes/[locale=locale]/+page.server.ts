import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { schema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import * as auth from "$lib/server/auth/session";
import * as z from "zod";
import { fi, en } from "zod/locales";

export const load: PageServerLoad = async (event) => {
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

	const form = await superValidate(zod4(schema), {
		defaults: {
			email: freshUser.email,
			firstNames: freshUser.firstNames ?? "",
			lastName: freshUser.lastName ?? "",
			homeMunicipality: freshUser.homeMunicipality ?? "",
			preferredLanguage: freshUser.preferredLanguage,
			isAllowedEmails: freshUser.isAllowedEmails,
		},
	});

	const result = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.where(eq(table.member.userId, freshUser.id))
		.orderBy(desc(table.membership.startTime));

	const memberships = result.map((m) => ({
		...m.membership,
		status: m.member.status,
		unique_id: m.member.id,
	}));

	return { user: freshUser, form, memberships };
};

export const actions: Actions = {
	saveInfo,
	signOut,
};

async function saveInfo(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	// Configure Zod locale based on user's language preference
	z.config(event.locals.locale === "fi" ? fi() : en());

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(schema));

	if (!form.valid) {
		return fail(400, { form });
	}

	const user = {
		...event.locals.user,
		...form.data,
	};

	try {
		await db
			.update(table.user)
			.set({
				// don't allow changing email here
				firstNames: user.firstNames,
				lastName: user.lastName,
				homeMunicipality: user.homeMunicipality,
				preferredLanguage: user.preferredLanguage,
				isAllowedEmails: user.isAllowedEmails,
			})
			.where(eq(table.user.id, user.id));

		return { form, success: true };
	} catch {
		return fail(500, { form, success: false, message: "Failed to save information" });
	}
}

async function signOut(event: RequestEvent) {
	if (!event.locals.session) {
		return fail(401, {
			message: "Not authenticated",
		});
	}
	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
}
