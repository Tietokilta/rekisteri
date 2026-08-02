import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import { oidcClient } from "$lib/server/db/schema";

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  const [existingClient] = await db.select({ id: oidcClient.clientId }).from(oidcClient).limit(1);

  return {
    user: event.locals.user,
    hasOidcClients: Boolean(existingClient),
  };
};
