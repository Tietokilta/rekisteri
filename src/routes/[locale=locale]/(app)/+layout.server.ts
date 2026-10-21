import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { withNext } from "$lib/utils/next";

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(
      302,
      withNext(
        route("/[locale=locale]/sign-in", { locale: event.locals.locale }),
        event.url.pathname + event.url.search,
      ),
    );
  }

  return {
    user: event.locals.user,
  };
};
