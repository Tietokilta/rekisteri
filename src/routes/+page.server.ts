import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { baseLocale, type Locale } from "$lib/i18n/routing";
import type { PreferredLanguage } from "$lib/server/db/schema";

function preferredLanguageToLocale(preferredLanguage: PreferredLanguage): Locale | null {
	switch (preferredLanguage) {
		case "finnish":
			return "fi";
		case "english":
			return "en";
		case "unspecified":
			return null;
		default:
			return null;
	}
}

export const load: PageServerLoad = (event) => {
	// Use user's preferred language if they have one, otherwise use base locale
	let targetLocale: Locale = baseLocale;

	if (event.locals.user?.preferredLanguage) {
		const preferredLocale = preferredLanguageToLocale(event.locals.user.preferredLanguage);
		targetLocale = preferredLocale || baseLocale;
	}

	redirect(302, `/${targetLocale}`);
};
