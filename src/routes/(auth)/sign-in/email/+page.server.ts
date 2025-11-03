import { fail, redirect } from "@sveltejs/kit";
import type { Actions, RequestEvent } from "./$types";
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
import { createSession, generateSessionToken, setSessionTokenCookie } from "$lib/server/auth/session";
import { generateUserId } from "$lib/server/auth/utils";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { route } from "$lib/ROUTES";
import { localizePathname, getLocaleFromPathname } from "$lib/i18n/routing";
import { auditLogin, auditLoginFailed } from "$lib/server/audit";
import { timingSafeEqual } from "node:crypto";

export async function load(event: RequestEvent) {
	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		const locale = getLocaleFromPathname(event.url.pathname);
		return redirect(302, localizePathname(route("/sign-in"), locale));
	}

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null || Date.now() >= otp.expiresAt.getTime()) {
		otp = await createEmailOTP(email);
		const locale = getLocaleFromPathname(event.url.pathname);
		sendOTPEmail(otp.email, otp.code, locale);
		setEmailOTPCookie(event, otp);
	}
	return {
		email: otp.email,
	};
}

const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

export const actions: Actions = {
	verify: verifyCode,
	resend: resendEmail,
	changeEmail: changeEmail,
};

async function verifyCode(event: RequestEvent) {
	// Lazy cleanup to prevent memory leaks
	otpVerifyBucket.cleanup();

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null) {
		return fail(401);
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
		const locale = getLocaleFromPathname(event.url.pathname);
		sendOTPEmail(otp.email, otp.code, locale);
		return {
			verify: {
				message: "The verification code was expired. We sent another code to your inbox.",
			},
		};
	}
	const capitalizedCode = code.toLocaleUpperCase("en");

	// Use constant-time comparison to prevent timing attacks
	// Pad both strings to same length to ensure timingSafeEqual works
	const maxLength = Math.max(otp.code.length, capitalizedCode.length);
	const expectedBuffer = Buffer.from(otp.code.padEnd(maxLength, "\0"), "utf-8");
	const providedBuffer = Buffer.from(capitalizedCode.padEnd(maxLength, "\0"), "utf-8");
	const isValid = timingSafeEqual(expectedBuffer, providedBuffer);
	if (!isValid) {
		await auditLoginFailed(event, otp.email);

		return fail(400, {
			verify: {
				message: "Incorrect code.",
			},
		});
	}

	const [existingUser] = await db.select().from(table.user).where(eq(table.user.email, otp.email));

	const userId = existingUser?.id ?? generateUserId();
	if (!existingUser) {
		await db.insert(table.user).values({
			id: userId,
			email: otp.email,
		});
	}

	const token = generateSessionToken();
	await createSession(token, userId);
	setSessionTokenCookie(event, token, new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));

	await auditLogin(event, userId);

	deleteEmailCookie(event);
	deleteEmailOTP(otp.id);
	deleteEmailOTPCookie(event);

	const locale = getLocaleFromPathname(event.url.pathname);
	redirect(302, localizePathname(route("/"), locale));
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
	const locale = getLocaleFromPathname(event.url.pathname);
	sendOTPEmail(otp.email, otp.code, locale);
	setEmailOTPCookie(event, otp);
	return {
		resend: {
			message: "A new code was sent to your inbox.",
		},
	};
}

async function changeEmail(event: RequestEvent) {
	// Get the OTP to delete it if it exists
	const otp = await getEmailOTPFromRequest(event);
	if (otp !== null) {
		deleteEmailOTP(otp.id);
	}

	// Clear cookies
	deleteEmailCookie(event);
	deleteEmailOTPCookie(event);

	// Redirect back to sign-in page
	const locale = getLocaleFromPathname(event.url.pathname);
	redirect(303, localizePathname(route("/sign-in"), locale));
}
