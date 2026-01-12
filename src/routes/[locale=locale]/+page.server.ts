import { fail, redirect, type RequestEvent } from "@sveltejs/kit";
import { route } from "$lib/ROUTES";
import * as auth from "$lib/server/auth/session";
import type { Actions } from "./$types";

// Traditional form actions (not remote functions)
export const actions: Actions = {
	async signOut(event: RequestEvent) {
		if (!event.locals.session) {
			return fail(401, {
				message: "Not authenticated",
			});
		}
		await auth.invalidateSession(event.locals.session.id);
		auth.deleteSessionTokenCookie(event);

		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	},
};
