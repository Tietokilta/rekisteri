import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
	redirect(302, route("/[locale=locale]/settings/profile", { locale: event.params.locale }));
};
