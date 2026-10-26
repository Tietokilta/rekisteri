import { form, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { eq, and } from "drizzle-orm";
import { db } from "#lib/server/db/index.js";
import { env } from "#lib/server/env.js";
import * as table from "#lib/server/db/schema.js";
import { getLL } from "#lib/server/i18n.js";
import { auditFromEvent } from "#lib/server/audit.js";
import { revokeGrantSchema } from "./schema";

export const revokeGrant = form(revokeGrantSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!env.OIDC_ENABLED) error(404, "Not found");
  if (!event.locals.session || !event.locals.user) {
    error(401, "Unauthorized");
  }

  const userId = event.locals.user.id;
  const clientId = data.clientId;

  // The consent (cascading to the grants and tokens linked to it) and any remaining tokens for this
  // user and app, together
  await db.transaction(async (tx) => {
    await tx
      .delete(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, userId), eq(table.oidcConsent.clientId, clientId)));
    await tx
      .delete(table.oidcEntity)
      .where(and(eq(table.oidcEntity.userId, userId), eq(table.oidcEntity.clientId, clientId)));
  });

  await auditFromEvent(event, "oidc_consent.revoke", {
    targetType: "oidc_client",
    targetId: clientId,
  });

  return { success: true, message: LL.settings.applications.revokedSuccess() };
});
