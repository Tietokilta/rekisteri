import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { createSchema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import * as auth from "$lib/server/auth/session";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	const schema = createSchema(event.locals.locale);
	const form = await superValidate(valibot(schema), {
		defaults: {
			email: event.locals.user.email,
			firstNames: event.locals.user.firstNames ?? "",
			lastName: event.locals.user.lastName ?? "",
			homeMunicipality: event.locals.user.homeMunicipality ?? "",
			preferredLanguage: event.locals.user.preferredLanguage,
			isAllowedEmails: event.locals.user.isAllowedEmails,
		},
	});

	const result = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.startTime));

	const memberships = result.map((m) => ({
		...m.membership,
		status: m.member.status,
		unique_id: m.member.id,
	}));

	return { user: event.locals.user, form, memberships };
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

	const schema = createSchema(event.locals.locale);
	const formData = await event.request.formData();
	const form = await superValidate(formData, valibot(schema));

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
