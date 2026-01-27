import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { timingSafeEqual } from "node:crypto";
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
import { getSafeRedirectUrl, returnToCookieName } from "$lib/server/redirect";
import { verifyCodeSchema } from "./schema";

const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

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

	deleteEmailCookie(event);
	deleteEmailOTP(otp.id);
	deleteEmailOTPCookie(event);

	// Get returnTo from cookie and clear it
	const returnTo = event.cookies.get(returnToCookieName);
	event.cookies.delete(returnToCookieName, { path: "/" });

	// Redirect to the safe return URL (validates against whitelist)
	const redirectUrl = getSafeRedirectUrl(returnTo, event.locals.locale);
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

	// Clear cookies
	deleteEmailCookie(event);
	deleteEmailOTPCookie(event);
	event.cookies.delete(returnToCookieName, { path: "/" });

	// Redirect back to management page
	redirect(303, route("/[locale=locale]/settings/emails", { locale: event.locals.locale }));
});
