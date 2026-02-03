import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }

  const result = await db
    .select()
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
    .where(eq(table.member.userId, event.locals.user.id))
    .orderBy(desc(table.membership.startTime));

  const memberships = result.map((m) => ({
    ...m.membership,
    membershipType: m.membership_type,
    status: m.member.status,
    unique_id: m.member.id,
  }));

  return { user: event.locals.user, memberships };
};
