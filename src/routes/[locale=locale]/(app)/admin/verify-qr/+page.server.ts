import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user?.isAdmin) {
    return redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
  }

  return {};
};
