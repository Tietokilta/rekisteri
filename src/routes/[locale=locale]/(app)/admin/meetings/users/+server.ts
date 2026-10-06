import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";

/** Every registry user for the check-in search, which filters them in the browser. */
export const GET: RequestHandler = async (event) => {
  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) error(404, "Not found");
  const now = new Date();
  const [users, members] = await Promise.all([
    db
      .select({
        id: table.user.id,
        email: table.user.email,
        firstNames: table.user.firstNames,
        lastName: table.user.lastName,
      })
      .from(table.user),
    db
      .select({ userId: table.member.userId, membershipTypeId: table.membership.membershipTypeId })
      .from(table.member)
      .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
      .where(
        and(
          eq(table.member.status, "active"),
          lte(table.membership.startTime, now),
          gte(table.membership.endTime, now),
        ),
      )
      // Later starts overwrite earlier ones below, matching how a check-in picks the membership
      .orderBy(asc(table.membership.startTime)),
  ]);
  const typeByUser = new Map(members.map((member) => [member.userId, member.membershipTypeId]));
  return json(
    users.map((user) => ({ ...user, membershipTypeId: typeByUser.get(user.id) ?? null })),
    { headers: { "cache-control": "no-store" } },
  );
};
