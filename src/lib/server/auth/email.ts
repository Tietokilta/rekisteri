import { generateRandomOTP } from "./utils";
import { db } from "$lib/server/db";
import { ExpiringTokenBucket } from "./rate-limit";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { dev } from "$app/environment";
import { sendEmail } from "$lib/server/mailgun";
import { i18nObject } from "$lib/i18n/i18n-util";
import { loadLocale } from "$lib/i18n/i18n-util.sync";

import type { EmailOTP } from "$lib/server/db/schema";
import type { RequestEvent } from "@sveltejs/kit";

export const emailCookieName = "email";
export const emailOTPCookieName = "email_otp";

export function setEmailCookie(event: RequestEvent, email: string, expiresAt: Date): void {
	event.cookies.set(emailCookieName, email, {
		expires: expiresAt,
		path: "/",
		httpOnly: true,
		secure: !dev,
		sameSite: "lax",
	});
}

export function deleteEmailCookie(event: RequestEvent): void {
	event.cookies.delete(emailCookieName, {
		path: "/",
	});
}

export async function getEmailOTP(id: string): Promise<EmailOTP | null> {
	const [result] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.id, id));
	return result ?? null;
}

export async function createEmailOTP(email: string): Promise<EmailOTP> {
	const idBytes = new Uint8Array(20);
	crypto.getRandomValues(idBytes);
	const id = encodeBase32LowerCaseNoPadding(idBytes);

	const code = generateRandomOTP();
	const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

	// Normalize email to lowercase for consistent storage and lookup
	const normalizedEmail = email.toLowerCase();

	const otp: EmailOTP = {
		id,
		code,
		email: normalizedEmail,
		expiresAt,
	};

	await db.insert(table.emailOTP).values(otp);
	return otp;
}

export async function deleteEmailOTP(id: string): Promise<void> {
	await db.delete(table.emailOTP).where(eq(table.emailOTP.id, id));
}

export function sendOTPEmail(email: string, code: string, locale: "fi" | "en" = "fi"): void {
	loadLocale(locale);
	const LL = i18nObject(locale);

	const emailOptions = {
		to: email,
		subject: LL.auth.emailSubject(),
		text: LL.auth.emailBody({ code }),
	};

	if (dev) {
		console.log("[Email] OTP email (dev mode):", emailOptions);
	} else {
		sendEmail(emailOptions).catch((err) => {
			// Critical: OTP emails are essential for authentication
			// Log with high severity and consider alerting in production monitoring
			console.error("[Email] CRITICAL: Failed to send OTP email to", email, ":", err);
		});
	}
}

export function setEmailOTPCookie(event: RequestEvent, otp: EmailOTP): void {
	event.cookies.set(emailOTPCookieName, otp.id, {
		httpOnly: true,
		path: "/",
		secure: !dev,
		sameSite: "lax",
		expires: otp.expiresAt,
	});
}

export function deleteEmailOTPCookie(event: RequestEvent): void {
	event.cookies.delete(emailOTPCookieName, {
		httpOnly: true,
		path: "/",
		secure: !dev,
		sameSite: "lax",
		maxAge: 0,
	});
}

export async function getEmailOTPFromRequest(event: RequestEvent): Promise<EmailOTP | null> {
	const id = event.cookies.get("email_otp") ?? null;
	if (id === null) {
		return null;
	}
	const otp = await getEmailOTP(id);
	if (otp === null) {
		deleteEmailOTPCookie(event);
	}
	return otp;
}

export const sendOTPBucket = new ExpiringTokenBucket<string>(3, 60 * 10);
