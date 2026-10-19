import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";
import { signInHref } from "#lib/server/auth/sign-in-next.js";
import { db } from "#lib/server/db/index.js";
import { oidcClient } from "#lib/server/db/schema.js";
import { env } from "#lib/server/env.js";

export const load: LayoutServerLoad = async (event) => {
  if (!event.locals.user) {
    redirect(302, signInHref(event));
  }

  const [existingClient] = env.OIDC_ENABLED
    ? await db.select({ id: oidcClient.clientId }).from(oidcClient).limit(1)
    : [];

  return {
    user: event.locals.user,
    hasOidcClients: Boolean(existingClient),
  };
};
