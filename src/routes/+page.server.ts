import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { baseLocale, preferredLanguageToLocale, type Locale } from "$lib/i18n/routing";

export const load: PageServerLoad = (event) => {
  // Use user's preferred language if they have one, otherwise use base locale
  let targetLocale: Locale = baseLocale;

  if (event.locals.user?.preferredLanguage) {
    const preferredLocale = preferredLanguageToLocale(event.locals.user.preferredLanguage);
    targetLocale = preferredLocale || baseLocale;
  }

  redirect(302, `/${targetLocale}`);
};
