import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { validateRedirect, setRedirectCookie, getRedirectPath } from "$lib/server/auth/redirect";

export const load: PageServerLoad = async (event) => {
	// Handle redirect parameter
	const redirectParam = event.url.searchParams.get("redirect");
	if (redirectParam) {
		const validatedRedirect = validateRedirect(redirectParam, event.url.origin);
		if (validatedRedirect) {
			// Store valid redirect in cookie to preserve through auth flow
			setRedirectCookie(event, validatedRedirect);
		}
	}

	// If already logged in, redirect to intended destination or home
	if (event.locals.user) {
		const redirectPath = getRedirectPath(event, event.url.origin, event.locals.user.isAdmin);
		redirect(302, route("/[locale=locale]", { locale: event.locals.locale }) + redirectPath);
	}

	// If email cookie exists, redirect to OTP verification page
	const emailCookie = event.cookies.get(emailCookieName);
	if (emailCookie) {
		redirect(302, route("/[locale=locale]/sign-in/email", { locale: event.locals.locale }));
	}

	return {};
};
