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
import { localizePathname, getLocaleFromPathname } from "$lib/i18n/routing";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		const locale = getLocaleFromPathname(event.url.pathname);
		return redirect(302, localizePathname(route("/sign-in"), locale));
	}

	const form = await superValidate(zod4(schema), {
		defaults: {
			email: event.locals.user.email,
			firstNames: event.locals.user.firstNames ?? "",
			lastName: event.locals.user.lastName ?? "",
			homeMunicipality: event.locals.user.homeMunicipality ?? "",
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

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(schema));

	const user = {
		...event.locals.user,
		...form.data,
	};

	await db
		.update(table.user)
		.set({
			// don't allow changing email here
			firstNames: user.firstNames,
			lastName: user.lastName,
			homeMunicipality: user.homeMunicipality,
			isAllowedEmails: user.isAllowedEmails,
		})
		.where(eq(table.user.id, user.id));

	const locale = getLocaleFromPathname(event.url.pathname);
	return redirect(302, localizePathname(route("/"), locale));
}

async function signOut(event: RequestEvent) {
	if (!event.locals.session) {
		return fail(401);
	}
	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	const locale = getLocaleFromPathname(event.url.pathname);
	return redirect(302, localizePathname(route("/sign-in"), locale));
}
