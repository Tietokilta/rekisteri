import type { LayoutLoad } from "./$types";
import { loadLocaleAsync } from "#lib/i18n/i18n-util.async.js";
import { setLocale } from "#lib/i18n/i18n-svelte.js";
import type { Locale } from "#lib/i18n/routing.js";

export const load: LayoutLoad = async ({ data, params }) => {
  const locale = params.locale as Locale;

  await loadLocaleAsync(locale);
  setLocale(locale);

  return { ...data, locale };
};
