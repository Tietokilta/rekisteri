import type { PageServerLoad } from "./$types";
import { loadLocale } from "$lib/i18n/i18n-util.sync";
import { i18nObject } from "$lib/i18n/i18n-util";
import type { Locales } from "$lib/i18n/i18n-types";

export const load: PageServerLoad = async (event) => {
  const { url, params } = event;

  const code = url.searchParams.get("code") || "ERR-UNKNOWN";

  const loc: Locales = params.locale === "en" ? "en" : "fi";
  loadLocale(loc);
  const LL = i18nObject(loc);

  return {
    code,
    title: LL.oidc.error.title(),
    description: LL.oidc.error.genericDescription(),
  };
};
