import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import {
	createEmailOTP,
	deleteEmailCookie,
	emailCookieName,
	sendOTPEmail,
	setEmailOTPCookie,
} from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
	// Require email cookie
	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	// Already logged in? Redirect home
	if (event.locals.user) {
		return redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
	}

	return {
		email,
	};
};

export const actions: Actions = {
	// User chose to use email OTP instead of passkey
	useEmail: useEmailAction,
	// User changed their mind about the email
	changeEmail: changeEmailAction,
};

async function useEmailAction(event: RequestEvent) {
	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		return fail(401, {
			message: "No email found",
		});
	}

	// Create and send OTP
	const otp = await createEmailOTP(email);
	await sendOTPEmail(otp.email, otp.code, event.locals.locale);
	setEmailOTPCookie(event, otp);

	// Redirect to OTP verification page
	redirect(303, route("/[locale=locale]/sign-in/email", { locale: event.locals.locale }));
}

async function changeEmailAction(event: RequestEvent) {
	// Clear email cookie
	deleteEmailCookie(event);

	// Redirect back to sign-in page
	redirect(303, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
}
