import type { LayoutLoad } from "./$types";
import { loadLocaleAsync } from "$lib/i18n/i18n-util.async";
import { setLocale } from "$lib/i18n/i18n-svelte";
import type { Locale } from "$lib/i18n/routing";

export const load: LayoutLoad = async ({ params }) => {
	const locale = params.locale as Locale;

	await loadLocaleAsync(locale);
	setLocale(locale);

	return { locale };
};
