import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import { oidcClient } from "$lib/server/db/schema";
import { env } from "$lib/server/env";

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  const [existingClient] = env.OIDC_ENABLED
    ? await db.select({ id: oidcClient.clientId }).from(oidcClient).limit(1)
    : [];

  return {
    user: event.locals.user,
    hasOidcClients: Boolean(existingClient),
  };
};
