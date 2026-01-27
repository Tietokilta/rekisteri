import type { PageServerLoad } from "./$types";
import { validateReturnUrl, setReturnToCookie } from "$lib/server/redirect";

export const load: PageServerLoad = async (event) => {
	// Read returnTo from URL params
	const returnTo = event.url.searchParams.get("returnTo");

	// Validate and store in cookie if valid
	const validReturnTo = validateReturnUrl(returnTo);
	if (validReturnTo) {
		setReturnToCookie(event.cookies, validReturnTo);
	}

	return {
		returnTo: validReturnTo,
	};
};
