import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { RefillingTokenBucket } from "$lib/server/auth/rate-limit";
import * as z from "zod";
import { setEmailCookie } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { i18n } from "$lib/i18n";

const ipBucket = new RefillingTokenBucket<string>(20, 1);

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) {
		redirect(302, i18n.resolveRoute(route("/")));
	}
	return {};
};

export const actions: Actions = {
	default: action,
};

async function action(event: RequestEvent) {
	const clientIP = event.request.headers.get("X-Forwarded-For");
	if (clientIP !== null && !ipBucket.check(clientIP, 1)) {
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
	if (clientIP !== null && !ipBucket.consume(clientIP, 1)) {
		return fail(429, {
			message: "Too many requests",
			email: "",
		});
	}

	setEmailCookie(event, email, new Date(Date.now() + 1000 * 60 * 10));
	redirect(303, i18n.resolveRoute(route("/sign-in/email")));
}
