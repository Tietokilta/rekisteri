import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { oidcClient } from "$lib/server/db/schema";
import { membershipTypeAt } from "$lib/server/membership/status";

/**
 * Whether the user may sign in to the client. Clients marked members-only need the user to be a
 * member (see membership/status.ts); other clients are open to every Rekisteri user.
 */
export async function canUseClient(userId: string, clientId: string): Promise<boolean> {
  const [client] = await db
    .select({ requireActiveMembership: oidcClient.requireActiveMembership })
    .from(oidcClient)
    .where(eq(oidcClient.clientId, clientId));
  if (!client?.requireActiveMembership) return true;
  return (await membershipTypeAt(db, userId, new Date())) !== null;
}
