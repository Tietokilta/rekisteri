import { fail, isRedirect, redirect } from "@sveltejs/kit";
import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { schema } from "./schema";
import { createSecondaryEmail } from "$lib/server/auth/secondary-email";
import { createEmailOTP, sendOTPEmail } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { dev } from "$app/environment";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import type { Actions, PageServerLoad } from "./$types";

const emailCookieName = "email";
const emailOTPCookieName = "email_otp";

export const load: PageServerLoad = async () => {
	const form = await superValidate(zod4(schema));
	return { form };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.user) {
			const form = await superValidate(request, zod4(schema));
			return fail(401, { form, message: "Not authenticated" });
		}

		const form = await superValidate(request, zod4(schema));

		if (!form.valid) {
			return fail(400, { form });
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

			cookies.set(emailOTPCookieName, encodeBase32LowerCaseNoPadding(new TextEncoder().encode(otp.id)), {
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
				return fail(400, { form, message: error.message });
			}
			return fail(400, { form, message: "An error occurred" });
		}
	},
};
