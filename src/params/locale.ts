import type { ParamMatcher } from "@sveltejs/kit";
import { locales, type Locale } from "$lib/i18n/routing";

export const match: ParamMatcher = (param) => {
	return locales.includes(param as Locale);
};
