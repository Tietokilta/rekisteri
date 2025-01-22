import * as auth from "$lib/server/auth/session";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { i18n } from "$lib/i18n";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, i18n.resolveRoute(route("/sign-in")));
	}
	return { user: event.locals.user };
};

export const actions: Actions = {
	logout: async (event) => {
		if (!event.locals.session) {
			return fail(401);
		}
		await auth.invalidateSession(event.locals.session.id);
		auth.deleteSessionTokenCookie(event);

		return redirect(302, i18n.resolveRoute(route("/sign-in")));
	},
};
