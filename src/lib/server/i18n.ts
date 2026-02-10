import { i18nObject } from "$lib/i18n/i18n-util";
import { loadAllLocales } from "$lib/i18n/i18n-util.sync";
import type { Locales, TranslationFunctions } from "$lib/i18n/i18n-types";

// Load all locales once at module initialization.
// Since there are only two locales (fi, en), this is fine to keep in memory.
loadAllLocales();

/**
 * Get a locale-specific translation object for server-side use.
 * All locales are pre-loaded at startup, so this is safe to call
 * from any request handler without per-request loading.
 */
export function getLL(locale: Locales): TranslationFunctions {
  return i18nObject(locale);
}
