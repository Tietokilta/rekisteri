import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(302, route("/[locale=locale]/sign-in", { locale: event.params.locale }));
  }

  return { user: event.locals.user };
};
