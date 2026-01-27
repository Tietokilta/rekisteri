import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";
import type { PageServerLoad } from "./$types";
import { getUserSecondaryEmails } from "$lib/server/auth/secondary-email";
import { returnToCookieName, getReturnToCookieOptions } from "$lib/server/redirect";

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) {
		return error(401, "Not authenticated");
	}

	// Store returnTo in cookie if provided (for email verification flow)
	const returnTo = url.searchParams.get("returnTo");
	if (returnTo) {
		cookies.set(returnToCookieName, returnTo, getReturnToCookieOptions(dev));
	}

	const emails = await getUserSecondaryEmails(locals.user.id);

	return {
		emails,
		primaryEmail: locals.user.email,
	};
};
