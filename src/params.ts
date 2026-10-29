import { defineParams } from "@sveltejs/kit/params";
// `vite build` loads this file with plain Node, which only resolves the real `.ts` path
import { locales, type Locale } from "#lib/i18n/routing.ts";

const matchLocale = (param: string): param is Locale => {
  return locales.includes(param as Locale);
};

export const params = defineParams({
  locale: (param) => (matchLocale(param) ? param : undefined),
});
