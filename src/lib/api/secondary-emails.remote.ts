import { error, redirect } from "@sveltejs/kit";
import { getRequestEvent, query, form } from "$app/server";
import { z } from "zod";
import { dev } from "$app/environment";
import { getUserSecondaryEmails, deleteSecondaryEmail, getSecondaryEmailById } from "$lib/server/auth/secondary-email";
import { createEmailOTP, sendOTPEmail, emailCookieName, emailOTPCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

/**
 * List all secondary emails for the authenticated user
 */
export const listSecondaryEmails = query(async () => {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		throw error(401, "Not authenticated");
	}

	const emails = await getUserSecondaryEmails(locals.user.id);

	return { emails };
});

/**
 * Delete a secondary email via form submission
 */
export const deleteSecondaryEmailForm = form(
	z.object({
		emailId: z.string().min(1, "Email ID is required"),
	}),
	async ({ emailId }) => {
		const { locals } = getRequestEvent();

		if (!locals.user) {
			throw error(401, "Not authenticated");
		}

		const success = await deleteSecondaryEmail(emailId, locals.user.id);

		if (!success) {
			throw error(404, "Email not found or does not belong to user");
		}

		// Refresh the email list
		await listSecondaryEmails().refresh();

		return { success: true };
	},
);

/**
 * Re-verify an expired or unverified email
 */
export const reverifySecondaryEmailForm = form(
	z.object({
		emailId: z.string().min(1, "Email ID is required"),
	}),
	async ({ emailId }) => {
		const { locals, cookies } = getRequestEvent();

		if (!locals.user) {
			throw error(401, "Not authenticated");
		}

		const email = await getSecondaryEmailById(emailId, locals.user.id);
		if (!email) {
			throw error(404, "Email not found");
		}

		// Create OTP and send email
		const otp = await createEmailOTP(email.email);
		sendOTPEmail(email.email, otp.code, locals.locale);

		// Set cookies for verification flow (matching email.ts pattern)
		cookies.set(emailCookieName, email.email, {
			expires: otp.expiresAt,
			path: "/",
			httpOnly: true,
			secure: !dev,
			sameSite: "lax",
		});

		// Set OTP cookie (otp.id is already encoded, don't double-encode it)
		cookies.set(emailOTPCookieName, otp.id, {
			expires: otp.expiresAt,
			path: "/",
			httpOnly: true,
			secure: !dev,
			sameSite: "lax",
		});

		// Server-side redirect ensures cookies are properly set before navigation
		redirect(303, route("/[locale=locale]/secondary-emails/verify", { locale: locals.locale }));
	},
);
