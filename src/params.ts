import { defineParams } from "@sveltejs/kit/params";
import { locales, Locale } from "#lib/i18n/routing.js";

const matchLocale = (param: string): param is Locale => {
  return locales.includes(param as Locale);
};

export const params = defineParams({
  locale: (param) => (matchLocale(param) ? param : undefined),
});
