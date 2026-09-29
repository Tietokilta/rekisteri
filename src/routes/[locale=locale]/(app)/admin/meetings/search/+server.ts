import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { userHasAdminAccess } from "$lib/server/auth/admin";

export const GET: RequestHandler = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) error(404, "Not found");
  const q = event.url.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  if (q.length < 2) return json([]);
  const pattern = `%${q.replaceAll(/[%_\\]/g, (char) => String.fromCodePoint(92) + char)}%`;
  const users = await db
    .select({
      id: table.user.id,
      email: table.user.email,
      firstNames: table.user.firstNames,
      lastName: table.user.lastName,
    })
    .from(table.user)
    .where(
      or(ilike(table.user.email, pattern), ilike(table.user.firstNames, pattern), ilike(table.user.lastName, pattern)),
    )
    .limit(15);
  const now = new Date();
  const members = users.length
    ? await db
        .select({ userId: table.member.userId, membershipTypeId: table.membership.membershipTypeId })
        .from(table.member)
        .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
        .where(
          and(
            inArray(
              table.member.userId,
              users.map((user) => user.id),
            ),
            eq(table.member.status, "active"),
            lte(table.membership.startTime, now),
            gte(table.membership.endTime, now),
          ),
        )
    : [];
  const typeByUser = new Map(members.map((member) => [member.userId, member.membershipTypeId]));
  return json(users.map((user) => ({ ...user, membershipTypeId: typeByUser.get(user.id) ?? null })));
};
