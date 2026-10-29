import { redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import * as auth from "#lib/server/auth/session.js";
import { route } from "#lib/ROUTES.js";

export const signOut = form(async () => {
  const event = getRequestEvent();

  if (!event.locals.session) {
    redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  await auth.invalidateSession(event.locals.session.id);
  auth.deleteSessionTokenCookie(event);

  redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
});
