import { generateRandomOTP } from "./utils";
import { db } from "$lib/server/db";
import { ExpiringTokenBucket } from "./rate-limit";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

import type { EmailOTP } from "$lib/server/db/schema";
import type { RequestEvent } from "@sveltejs/kit";

export const emailCookieName = "email";
export const emailOTPCookieName = "email_otp";

export function setEmailCookie(event: RequestEvent, email: string, expiresAt: Date): void {
	event.cookies.set(emailCookieName, email, {
		expires: expiresAt,
		path: "/",
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

	const otp: EmailOTP = {
		id,
		code,
		email,
		expiresAt,
	};

	await db.insert(table.emailOTP).values(otp);
	return otp;
}

export async function deleteEmailOTP(id: string): Promise<void> {
	await db.delete(table.emailOTP).where(eq(table.emailOTP.id, id));
}

export function sendOTPEmail(email: string, code: string): void {
	console.log(`To ${email}: Your login code is ${code}`);
}

export function setEmailOTPCookie(event: RequestEvent, otp: EmailOTP): void {
	event.cookies.set(emailOTPCookieName, otp.id, {
		httpOnly: true,
		path: "/",
		secure: import.meta.env.PROD,
		sameSite: "lax",
		expires: otp.expiresAt,
	});
}

export function deleteEmailOTPCookie(event: RequestEvent): void {
	event.cookies.delete(emailOTPCookieName, {
		httpOnly: true,
		path: "/",
		secure: import.meta.env.PROD,
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
