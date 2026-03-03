import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { hasAdminAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!hasAdminAccess(event.locals.user)) {
    return redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
  }

  return {};
};
