import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getUserSecondaryEmails } from "$lib/server/auth/secondary-email";

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return error(401, "Not authenticated");
	}

	const emails = await getUserSecondaryEmails(locals.user.id);

	return {
		emails,
		primaryEmail: locals.user.email,
	};
};
