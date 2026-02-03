import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { emailCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";

export const load: PageServerLoad = async (event) => {
  // Require email cookie
  const email = event.cookies.get(emailCookieName);
  if (typeof email !== "string") {
    return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  // Already logged in? Redirect home
  if (event.locals.user) {
    return redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
  }

  return {
    email,
  };
};
