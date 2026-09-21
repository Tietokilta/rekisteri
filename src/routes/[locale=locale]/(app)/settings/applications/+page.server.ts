import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { oidcConsent, oidcClient } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !event.locals.user) {
    error(401, "Unauthorized");
  }

  const grants = await db
    .select({
      id: oidcConsent.id,
      clientId: oidcConsent.clientId,
      clientName: oidcClient.name,
      grantedScopes: oidcClient.scopes,
      createdAt: oidcConsent.createdAt,
      updatedAt: oidcConsent.updatedAt,
    })
    .from(oidcConsent)
    .innerJoin(oidcClient, eq(oidcConsent.clientId, oidcClient.clientId))
    .where(eq(oidcConsent.userId, event.locals.user.id));

  return {
    grants,
  };
};
