import { error, redirect } from "@sveltejs/kit";
import { getRequestEvent, query, form } from "$app/server";
import { dev } from "$app/environment";
import {
	getUserSecondaryEmails,
	deleteSecondaryEmail,
	getSecondaryEmailById,
	createSecondaryEmail,
} from "$lib/server/auth/secondary-email";
import { createEmailOTP, sendOTPEmail, emailCookieName, emailOTPCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import { addSecondaryEmailSchema } from "./secondary-emails.schema";
import { env } from "$lib/server/env";

// Rate limit: 10 add attempts per user per hour in production, 1000 in test mode
// SECURITY: Prevents email enumeration attacks
// Higher limit when UNSAFE_DISABLE_RATE_LIMITS is set (for e2e tests)
const isRateLimitDisabled = dev || env.UNSAFE_DISABLE_RATE_LIMITS;
const addEmailBucket = new ExpiringTokenBucket<string>(isRateLimitDisabled ? 1000 : 10, 60 * 60);

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

/**
 * Add a new secondary email via form submission
 */
export const addSecondaryEmailForm = form(addSecondaryEmailSchema, async ({ email }, invalid) => {
	const { locals, cookies } = getRequestEvent();

	// Lazy cleanup to prevent memory leaks
	addEmailBucket.cleanup();

	if (!locals.user) {
		throw error(401, "Not authenticated");
	}

	// Rate limit by user ID to prevent enumeration
	if (!addEmailBucket.consume(locals.user.id, 1)) {
		throw error(429, "Too many attempts. Please try again later.");
	}

	try {
		// Create unverified secondary email
		await createSecondaryEmail(locals.user.id, email);

		// Create OTP and send
		const otp = await createEmailOTP(email);
		sendOTPEmail(email, otp.code, locals.locale);

		// Set cookies for verification (matching email.ts pattern)
		cookies.set(emailCookieName, email, {
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

		redirect(303, route("/[locale=locale]/secondary-emails/verify", { locale: locals.locale }));
	} catch (err) {
		// Re-throw SvelteKit errors (redirect, error, etc.)
		if (err && typeof err === "object" && "status" in err) {
			throw err;
		}
		// Use invalid.email() to attach error to the email field
		if (err instanceof Error) {
			return invalid(invalid.email(err.message));
		}
		return invalid(invalid.email("An error occurred"));
	}
});
