import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { flattenCustomization } from "$lib/server/customization/utils";
import { hasAdminAccess, hasAdminWriteAccess } from "$lib/shared/enums";
import { db } from "$lib/server/db";
import { oidcClient } from "$lib/server/db/schema";
import { asc } from "drizzle-orm";
import { env } from "$lib/server/env";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !hasAdminAccess(event.locals.user?.adminRole ?? "none")) {
    return error(404, "Not found");
  }

  // Use the pre-populated customizations from locals (cached)
  const customizations = event.locals.customizations;
  const values = flattenCustomization(customizations);

  const customImageExists = {
    logo: !!customizations.logo,
    logoDark: !!customizations.logoDark,
    favicon: !!customizations.favicon,
    faviconDark: !!customizations.faviconDark,
  };

  // Everything but the client secret hash, which the page never needs
  const oidcClients = env.OIDC_ENABLED
    ? await db
        .select({
          clientId: oidcClient.clientId,
          name: oidcClient.name,
          type: oidcClient.type,
          redirectUris: oidcClient.redirectUris,
          scopes: oidcClient.scopes,
          requireActiveMembership: oidcClient.requireActiveMembership,
        })
        .from(oidcClient)
        .orderBy(asc(oidcClient.name))
    : [];

  return {
    values,
    customImageExists,
    imageVersion: customizations.updatedAt.getTime().toString(36),
    canWrite: hasAdminWriteAccess(event.locals.user?.adminRole ?? "none"),
    oidcClients,
    oidcEnabled: env.OIDC_ENABLED,
  };
};
