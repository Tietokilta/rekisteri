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
import * as table from "$lib/server/db/schema";
import { encodeBase32LowerCase } from "@oslojs/encoding";
import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { route } from "$lib/ROUTES";
import { localizeHref } from "$lib/paraglide/runtime";

export async function load(event: RequestEvent) {
	const email = event.cookies.get(emailCookieName);
	if (typeof email !== "string") {
		return redirect(302, localizeHref(route("/sign-in")));
	}

	let otp = await getEmailOTPFromRequest(event);
	if (otp === null || Date.now() >= otp.expiresAt.getTime()) {
		otp = await createEmailOTP(email);
		sendOTPEmail(otp.email, otp.code);
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
};

async function verifyCode(event: RequestEvent) {
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
		sendOTPEmail(otp.email, otp.code);
		return {
			verify: {
				message: "The verification code was expired. We sent another code to your inbox.",
			},
		};
	}
	const capitalizedCode = code.toLocaleUpperCase("en");
	if (otp.code !== capitalizedCode) {
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

	deleteEmailCookie(event);
	deleteEmailOTP(otp.id);
	deleteEmailOTPCookie(event);

	redirect(302, localizeHref(route("/")));
}

function generateUserId() {
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	return encodeBase32LowerCase(bytes);
}

async function resendEmail(event: RequestEvent) {
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
	sendOTPEmail(otp.email, otp.code);
	setEmailOTPCookie(event, otp);
	return {
		resend: {
			message: "A new code was sent to your inbox.",
		},
	};
}
