import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, count, sql } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !event.locals.user?.isAdmin) {
    return error(404, "Not found");
  }

  // Load all membership types with their membership count
  const membershipTypes = await db
    .select({
      id: table.membershipType.id,
      name: table.membershipType.name,
      description: table.membershipType.description,
      createdAt: table.membershipType.createdAt,
      updatedAt: table.membershipType.updatedAt,
      membershipCount: count(table.membership.id),
    })
    .from(table.membershipType)
    .leftJoin(table.membership, sql`${table.membershipType.id} = ${table.membership.membershipTypeId}`)
    .groupBy(table.membershipType.id)
    .orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

  return {
    membershipTypes,
  };
};
