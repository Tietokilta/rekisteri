import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
	}

	// If email cookie exists, redirect to OTP verification page
	const emailCookie = event.cookies.get(emailCookieName);
	if (emailCookie) {
		redirect(302, route("/[locale=locale]/sign-in/email", { locale: event.locals.locale }));
	}

	return {};
};
