import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
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
import { timingSafeEqual } from "node:crypto";
import { getUserSecondaryEmails, markSecondaryEmailVerified } from "$lib/server/auth/secondary-email";

export const load: PageServerLoad = async (event) => {
	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		return redirect(302, route("/[locale=locale]/secondary-emails", { locale: event.locals.locale }));
	}

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null || Date.now() >= otp.expiresAt.getTime()) {
		otp = await createEmailOTP(email);
		sendOTPEmail(otp.email, otp.code, event.locals.locale);
		setEmailOTPCookie(event, otp);
	}
	return {
		email: otp.email,
	};
};

const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

export const actions: Actions = {
	verify: verifyCode,
	resend: resendEmail,
	cancel: cancelVerification,
};

async function verifyCode(event: RequestEvent) {
	// Lazy cleanup to prevent memory leaks
	otpVerifyBucket.cleanup();

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null) {
		return fail(401, {
			verify: {
				message: "Not authenticated",
			},
		});
	}

	if (!otpVerifyBucket.check(otp.email, 1)) {
		return fail(429, {
			verify: {
				message: "Too many requests",
			},
		});
	}

	const formData = await event.request.formData();
	const code = formData.get("code");
	if (typeof code !== "string") {
		return fail(400, {
			verify: {
				message: "Invalid or missing fields",
			},
		});
	}
	if (code === "") {
		return fail(400, {
			verify: {
				message: "Enter your code",
			},
		});
	}

	if (!otpVerifyBucket.consume(otp.email, 1)) {
		return fail(429, {
			verify: {
				message: "Too many requests",
			},
		});
	}

	if (Date.now() >= otp.expiresAt.getTime()) {
		otp = await createEmailOTP(otp.email);
		sendOTPEmail(otp.email, otp.code, event.locals.locale);
		return {
			verify: {
				message: "The verification code was expired. We sent another code to your inbox.",
			},
		};
	}
	const capitalizedCode = code.toLocaleUpperCase("en");

	// Use constant-time comparison to prevent timing attacks
	const expectedBuffer = Buffer.from(otp.code, "utf8");
	const providedBuffer = Buffer.from(capitalizedCode.padEnd(otp.code.length, "\0"), "utf8");
	const isValid = expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
	if (!isValid) {
		return fail(400, {
			verify: {
				message: "Incorrect code.",
			},
		});
	}

	// Find the secondary email record for this user
	if (!event.locals.user) {
		return fail(401, {
			verify: {
				message: "Not authenticated",
			},
		});
	}

	const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
	const emailToVerify = secondaryEmails.find((e) => e.email === otp.email);

	if (!emailToVerify) {
		return fail(404, {
			verify: {
				message: "Email not found",
			},
		});
	}

	// Mark as verified
	await markSecondaryEmailVerified(emailToVerify.id, event.locals.user.id);

	deleteEmailCookie(event);
	deleteEmailOTP(otp.id);
	deleteEmailOTPCookie(event);

	redirect(302, route("/[locale=locale]/secondary-emails", { locale: event.locals.locale }));
}

async function resendEmail(event: RequestEvent) {
	// Lazy cleanup to prevent memory leaks
	sendOTPBucket.cleanup();

	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		return fail(401, {
			resend: {
				message: "Not authenticated",
			},
		});
	}

	if (!sendOTPBucket.check(email, 1)) {
		return fail(429, {
			resend: {
				message: "Too many requests",
			},
		});
	}

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null) {
		if (!sendOTPBucket.consume(email, 1)) {
			return fail(429, {
				resend: {
					message: "Too many requests",
				},
			});
		}
		otp = await createEmailOTP(email);
	} else {
		if (!sendOTPBucket.consume(email, 1)) {
			return fail(429, {
				resend: {
					message: "Too many requests",
				},
			});
		}
		otp = await createEmailOTP(email);
	}
	sendOTPEmail(otp.email, otp.code, event.locals.locale);
	setEmailOTPCookie(event, otp);
	return {
		resend: {
			message: "A new code was sent to your inbox.",
		},
	};
}

async function cancelVerification(event: RequestEvent) {
	// Get the OTP to delete it if it exists
	const otp = await getEmailOTPFromRequest(event);
	if (otp !== null) {
		deleteEmailOTP(otp.id);
	}

	// Clear cookies
	deleteEmailCookie(event);
	deleteEmailOTPCookie(event);

	// Redirect back to management page
	redirect(303, route("/[locale=locale]/secondary-emails", { locale: event.locals.locale }));
}
