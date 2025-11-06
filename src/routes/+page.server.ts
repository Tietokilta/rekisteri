import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { baseLocale } from "$lib/i18n/routing";

export const load: PageServerLoad = () => {
	redirect(302, `/${baseLocale}`);
};
