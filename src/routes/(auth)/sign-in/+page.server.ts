import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { RefillingTokenBucket } from "$lib/server/auth/rate-limit";
import * as z from "zod/v4";
import { setEmailCookie, emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { localizePathname, getLocaleFromPathname } from "$lib/i18n/routing";

const ipBucket = new RefillingTokenBucket<string>(20, 1);

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		const locale = getLocaleFromPathname(event.url.pathname);
		redirect(302, localizePathname(route("/"), locale));
	}

	// If email cookie exists, redirect to OTP verification page
	const emailCookie = event.cookies.get(emailCookieName);
	if (emailCookie) {
		const locale = getLocaleFromPathname(event.url.pathname);
		redirect(302, localizePathname(route("/sign-in/email"), locale));
	}

	return {};
};

export const actions: Actions = {
	default: action,
};

async function action(event: RequestEvent) {
	// Azure App Service adds the real client IP to the rightmost position of X-Forwarded-For
	// Parse from right to left to get the trusted IP that Azure added
	const forwardedFor = event.request.headers.get("X-Forwarded-For");
	const clientIP =
		forwardedFor
			?.split(",")
			.map((ip) => ip.trim())
			.pop() || "unknown";

	if (clientIP !== "unknown" && !ipBucket.check(clientIP, 1)) {
		return fail(429, {
			message: "Too many requests",
			email: "",
		});
	}

	const formData = await event.request.formData();
	const emailInput = formData.get("email");

	const emailResult = z.string().email().safeParse(emailInput);
	if (!emailResult.success) {
		return fail(400, {
			message: "Invalid email",
			email: emailInput,
		});
	}
	const email = emailResult.data;
	if (clientIP !== "unknown" && !ipBucket.consume(clientIP, 1)) {
		return fail(429, {
			message: "Too many requests",
			email: "",
		});
	}

	setEmailCookie(event, email, new Date(Date.now() + 1000 * 60 * 10));
	const locale = getLocaleFromPathname(event.url.pathname);
	redirect(303, localizePathname(route("/sign-in/email"), locale));
}
