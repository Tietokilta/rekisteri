import * as runtime from "$lib/paraglide/runtime";
import { createI18n } from "@inlang/paraglide-sveltekit";
import type { Routes } from "./ROUTES";

export const i18n = createI18n(runtime, {
	defaultLanguageTag: "en",
	prefixDefaultLanguage: "always",
	pathnames: {
		"/sign-in": {
			fi: "/kirjaudu-sisaan",
			en: "/sign-in",
		},
	} as const satisfies Partial<Record<Routes, unknown /* inferred */>>,
});
