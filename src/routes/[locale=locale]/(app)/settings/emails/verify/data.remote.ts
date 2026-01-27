import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { timingSafeEqual } from "node:crypto";
import { dev } from "$app/environment";
import {
	createEmailOTP,
	deleteEmailCookie,
	deleteEmailOTP,
	deleteEmailOTPCookie,
	emailCookieName,
	getEmailOTPFromRequest,
	sendOTPEmail,
	sendOTPBucket,
	setEmailOTPCookie,
} from "$lib/server/auth/email";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import { route } from "$lib/ROUTES";
import { getUserSecondaryEmails, markSecondaryEmailVerified } from "$lib/server/auth/secondary-email";
import { emailVerifyRedirectCookieName } from "$lib/api/secondary-emails.remote";
import { validateRedirectUrl } from "$lib/utils";
import { verifyCodeSchema } from "./schema";

const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

/**
 * Delete the redirect cookie after verification
 */
function deleteRedirectCookie(event: ReturnType<typeof getRequestEvent>) {
	event.cookies.delete(emailVerifyRedirectCookieName, {
		path: "/",
		httpOnly: true,
		secure: !dev,
		sameSite: "lax",
	});
}

export const verifyCode = form(verifyCodeSchema, async ({ code }) => {
	const event = getRequestEvent();

	// Lazy cleanup to prevent memory leaks
	otpVerifyBucket.cleanup();

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null) {
		error(401, "Not authenticated");
	}

	if (!otpVerifyBucket.check(otp.email, 1)) {
		error(429, "Too many requests");
	}

	if (!otpVerifyBucket.consume(otp.email, 1)) {
		error(429, "Too many requests");
	}

	if (Date.now() >= otp.expiresAt.getTime()) {
		otp = await createEmailOTP(otp.email);
		sendOTPEmail(otp.email, otp.code, event.locals.locale);
		return {
			message: "The verification code was expired. We sent another code to your inbox.",
		};
	}

	const capitalizedCode = code.toLocaleUpperCase("en");

	// Use constant-time comparison to prevent timing attacks
	const expectedBuffer = Buffer.from(otp.code, "utf8");
	const providedBuffer = Buffer.from(capitalizedCode.padEnd(otp.code.length, "\0"), "utf8");
	const isValid = expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
	if (!isValid) {
		error(400, "Incorrect code.");
	}

	// Find the secondary email record for this user
	if (!event.locals.user) {
		error(401, "Not authenticated");
	}

	const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
	const emailToVerify = secondaryEmails.find((e) => e.email === otp.email);

	if (!emailToVerify) {
		error(404, "Email not found");
	}

	// Mark as verified
	await markSecondaryEmailVerified(emailToVerify.id, event.locals.user.id);

	// Get the redirect URL from cookie before deleting cookies
	const redirectCookie = event.cookies.get(emailVerifyRedirectCookieName);
	const validatedRedirect = validateRedirectUrl(redirectCookie);

	deleteEmailCookie(event);
	deleteEmailOTP(otp.id);
	deleteEmailOTPCookie(event);
	deleteRedirectCookie(event);

	// Redirect to the stored redirect URL or fall back to emails page
	const redirectUrl = validatedRedirect ?? route("/[locale=locale]/settings/emails", { locale: event.locals.locale });
	redirect(302, redirectUrl);
});

export const resendEmail = form(async () => {
	const event = getRequestEvent();

	// Lazy cleanup to prevent memory leaks
	sendOTPBucket.cleanup();

	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		error(401, "Not authenticated");
	}

	if (!sendOTPBucket.check(email, 1)) {
		error(429, "Too many requests");
	}

	if (!sendOTPBucket.consume(email, 1)) {
		error(429, "Too many requests");
	}

	const otp = await createEmailOTP(email);
	sendOTPEmail(otp.email, otp.code, event.locals.locale);
	setEmailOTPCookie(event, otp);

	return {
		message: "A new code was sent to your inbox.",
	};
});

export const cancelVerification = form(async () => {
	const event = getRequestEvent();

	// Get the OTP to delete it if it exists
	const otp = await getEmailOTPFromRequest(event);
	if (otp !== null) {
		deleteEmailOTP(otp.id);
	}

	// Clear cookies (including redirect cookie)
	deleteEmailCookie(event);
	deleteEmailOTPCookie(event);
	deleteRedirectCookie(event);

	// Redirect back to management page (ignore redirect cookie on cancel)
	redirect(303, route("/[locale=locale]/settings/emails", { locale: event.locals.locale }));
});
