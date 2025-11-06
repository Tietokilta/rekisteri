import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { RefillingTokenBucket } from "$lib/server/auth/rate-limit";
import * as z from "zod";
import { setEmailCookie, emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

const ipBucket = new RefillingTokenBucket<string>(20, 1);

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

export const actions: Actions = {
	default: action,
};

async function action(event: RequestEvent) {
	// Lazy cleanup to prevent memory leaks
	ipBucket.cleanup();

	// Use adapter-provided client IP (respects ADDRESS_HEADER environment variable)
	// Azure App Service provides X-Client-IP header (no port, cannot be spoofed)
	// See: https://github.com/Azure/app-service-linux-docs/blob/master/Things_You_Should_Know/headers.md
	const clientIP = event.getClientAddress();

	if (!ipBucket.check(clientIP, 1)) {
		return fail(429, {
			message: "Too many requests",
			email: "",
		});
	}

	const formData = await event.request.formData();
	const emailInput = formData.get("email");

	const emailResult = z.email().safeParse(emailInput);
	if (!emailResult.success) {
		return fail(400, {
			message: "Invalid email",
			email: emailInput,
		});
	}
	const email = emailResult.data;
	if (!ipBucket.consume(clientIP, 1)) {
		return fail(429, {
			message: "Too many requests",
			email: "",
		});
	}

	setEmailCookie(event, email, new Date(Date.now() + 1000 * 60 * 10));
	redirect(303, route("/[locale=locale]/sign-in/email", { locale: event.locals.locale }));
}
