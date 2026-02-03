import type { Locales } from "./i18n-types";
import type { PreferredLanguage } from "$lib/shared/enums";

export const locales = ["fi", "en"] as const satisfies readonly Locales[];
export const baseLocale = "fi" as const satisfies Locales;

export type Locale = (typeof locales)[number];

export function stripLocaleFromPathname(pathname: string): string {
  const segments = pathname.split("/");
  const maybeLocale = segments[1];

  if (maybeLocale && locales.includes(maybeLocale as Locale)) {
    return "/" + segments.slice(2).join("/");
  }

  return pathname;
}

/**
 * Convert user's preferred language setting to a locale code.
 * Returns null if language is unspecified or unknown.
 */
export function preferredLanguageToLocale(preferredLanguage: PreferredLanguage): Locale | null {
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
