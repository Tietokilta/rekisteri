import type { Reroute } from "@sveltejs/kit";
import { stripLocaleFromPathname } from "$lib/i18n/routing";

export const reroute: Reroute = (request) => {
	return stripLocaleFromPathname(request.url.pathname);
};
