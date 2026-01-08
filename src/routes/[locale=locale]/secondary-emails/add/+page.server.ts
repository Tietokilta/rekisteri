import { fail, isRedirect, redirect } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { schema } from "./schema";
import { createSecondaryEmail } from "$lib/server/auth/secondary-email";
import { createEmailOTP, sendOTPEmail } from "$lib/server/auth/email";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import { route } from "$lib/ROUTES";
import { dev } from "$app/environment";
import type { Actions, PageServerLoad } from "./$types";

const emailCookieName = "email";
const emailOTPCookieName = "email_otp";

// Rate limit: 10 add attempts per user per hour
// SECURITY: Prevents email enumeration attacks
const addEmailBucket = new ExpiringTokenBucket<string>(10, 60 * 60);

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(schema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		// Lazy cleanup to prevent memory leaks
		addEmailBucket.cleanup();

		if (!locals.user) {
			const form = await superValidate(request, zod4(schema));
			return message(form, "Not authenticated", { status: 401 });
		}

		const form = await superValidate(request, zod4(schema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Rate limit by user ID to prevent enumeration
		if (!addEmailBucket.consume(locals.user.id, 1)) {
			return message(form, "Too many attempts. Please try again later.", { status: 429 });
		}

		try {
			// Create unverified secondary email
			await createSecondaryEmail(locals.user.id, form.data.email);

			// Create OTP and send
			const otp = await createEmailOTP(form.data.email);
			sendOTPEmail(form.data.email, otp.code, locals.locale);

			// Set cookies for verification (matching email.ts pattern)
			cookies.set(emailCookieName, form.data.email, {
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

			return redirect(303, route("/[locale=locale]/secondary-emails/verify", { locale: locals.locale }));
		} catch (error) {
			if (isRedirect(error)) {
				throw error;
			}
			if (error instanceof Error) {
				return message(form, error.message, { status: 400 });
			}
			return message(form, "An error occurred", { status: 400 });
		}
	},
};
