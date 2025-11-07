import type { Locales } from "./i18n-types";

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
