import type { PageServerLoad } from "./$types";
import { validateRedirectUrl } from "$lib/utils";

export const load: PageServerLoad = async (event) => {
	// Read and validate the redirect URL from query params
	const redirectParam = event.url.searchParams.get("redirect");
	const validatedRedirect = validateRedirectUrl(redirectParam);

	return {
		redirect: validatedRedirect,
	};
};
