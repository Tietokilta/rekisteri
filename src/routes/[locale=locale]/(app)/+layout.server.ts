import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { route } from "$lib/ROUTES";

export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	return {
		user: event.locals.user,
	};
};
