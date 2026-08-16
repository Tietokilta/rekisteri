import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, count, sql } from "drizzle-orm";
import { userHasAdminAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) {
    return error(404, "Not found");
  }

  // Load all membership types with their membership count
  const membershipTypes = await db
    .select({
      id: table.membershipType.id,
      name: table.membershipType.name,
      description: table.membershipType.description,
      purchasable: table.membershipType.purchasable,
      requiresPayment: table.membershipType.requiresPayment,
      requiresStudentVerification: table.membershipType.requiresStudentVerification,
      createdAt: table.membershipType.createdAt,
      updatedAt: table.membershipType.updatedAt,
      membershipCount: count(table.membershipFeePeriod.id),
      hasApplicationTarget: sql<boolean>`COALESCE(bool_or(
        ${table.membershipFeePeriod.acceptsApplications}
        AND ${table.membershipFeePeriod.publishedAt} IS NOT NULL
        AND ${table.membershipFeePeriod.endDate} >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Helsinki')::date
        AND (NOT ${table.membershipType.requiresPayment} OR ${table.membershipFeePeriod.stripePriceId} IS NOT NULL)
      ), false)`,
    })
    .from(table.membershipType)
    .leftJoin(
      table.membershipFeePeriod,
      sql`${table.membershipType.id} = ${table.membershipFeePeriod.membershipTypeId}`,
    )
    .groupBy(table.membershipType.id)
    .orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

  return {
    membershipTypes,
  };
};
