import { form, getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { eq, and, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { getLL } from "$lib/server/i18n";
import { auditFromEvent } from "$lib/server/audit";
import { revokeGrantSchema } from "./schema";

export const revokeGrant = form(revokeGrantSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user) {
    error(401, "Unauthorized");
  }

  const userId = event.locals.user.id;
  const clientId = data.clientId;

  // 1. Delete the oidc_consent entry (this automatically cascades to delete all oidc_entity records linked via consent_id)
  await db
    .delete(table.oidcConsent)
    .where(and(eq(table.oidcConsent.userId, userId), eq(table.oidcConsent.clientId, clientId)));

  // 2. Delete any remaining unlinked entities where payload JSON contains matching accountId and clientId
  await db
    .delete(table.oidcEntity)
    .where(
      sql`${table.oidcEntity.payload}->>'accountId' = ${userId} AND ${table.oidcEntity.payload}->>'clientId' = ${clientId}`,
    );

  await auditFromEvent(event, "oidc_consent.revoke", {
    targetType: "oidc_client",
    targetId: clientId,
  });

  return { success: true, message: LL.settings.applications.revokedSuccess() };
});
