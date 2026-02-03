import type { ParamMatcher } from "@sveltejs/kit";
import { locales, type Locale } from "$lib/i18n/routing";

export const match = ((param: string): param is Locale => {
  return locales.includes(param as Locale);
}) satisfies ParamMatcher;
