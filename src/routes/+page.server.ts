import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { schema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import * as auth from "$lib/server/auth/session";
import { createSession } from "$lib/server/payment/session";
import { localizeHref } from "$lib/paraglide/runtime";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, localizeHref(route("/sign-in")));
	}

	const form = await superValidate(zod(schema), {
		defaults: {
			email: event.locals.user.email,
			firstNames: event.locals.user.firstNames ?? "",
			lastName: event.locals.user.lastName ?? "",
			homeMunicipality: event.locals.user.homeMunicipality ?? "",
			isAllowedEmails: event.locals.user.isAllowedEmails,
		},
	});

	return { user: event.locals.user, form };
};

export const actions: Actions = {
	saveInfo,
	signOut,
	payMembership,
};

async function saveInfo(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod(schema));

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

	return redirect(302, localizeHref(route("/")));
}

async function signOut(event: RequestEvent) {
	if (!event.locals.session) {
		return fail(401);
	}
	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	return redirect(302, localizeHref(route("/sign-in")));
}

async function payMembership(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}
	const membershipId = "TODO";
	const paymentSession = await createSession(event.locals.user.id, membershipId);
	if (!paymentSession || !paymentSession.url) {
		return fail(400, {
			message: "Could not create payment session",
		});
	}
	return redirect(303, paymentSession.url);
}
