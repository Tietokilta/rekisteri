import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import {
	createEmailOTP,
	deleteEmailCookie,
	emailCookieName,
	sendOTPEmail,
	setEmailOTPCookie,
} from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

export const useEmail = form(async () => {
	const event = getRequestEvent();

	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		error(401, "No email found");
	}

	// Create and send OTP
	const otp = await createEmailOTP(email);
	await sendOTPEmail(otp.email, otp.code, event.locals.locale);
	setEmailOTPCookie(event, otp);

	// Redirect to OTP verification page
	redirect(303, route("/[locale=locale]/sign-in/email", { locale: event.locals.locale }));
});

export const changeEmail = form(async () => {
	const event = getRequestEvent();

	// Clear email cookie
	deleteEmailCookie(event);

	// Redirect back to sign-in page
	redirect(303, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
});
