import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getUserSecondaryEmails } from "$lib/server/auth/secondary-email";
import { validateRedirectUrl } from "$lib/utils";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		return error(401, "Not authenticated");
	}

	const emails = await getUserSecondaryEmails(locals.user.id);

	// Read and validate the redirect URL from query params
	const redirectParam = url.searchParams.get("redirect");
	const validatedRedirect = validateRedirectUrl(redirectParam);

	return {
		emails,
		primaryEmail: locals.user.email,
		redirect: validatedRedirect,
	};
};
