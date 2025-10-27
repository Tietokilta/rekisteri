import type { LayoutLoad } from "./$types";
import { loadLocaleAsync } from "$lib/i18n/i18n-util.async";
import { setLocale } from "$lib/i18n/i18n-svelte";
import { getLocaleFromPathname } from "$lib/i18n/routing";

export const load: LayoutLoad = async ({ url }) => {
	const locale = getLocaleFromPathname(url.pathname);

	await loadLocaleAsync(locale);
	setLocale(locale);

	return { locale };
};
