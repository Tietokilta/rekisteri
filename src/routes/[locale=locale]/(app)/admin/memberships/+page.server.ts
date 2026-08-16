import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, count, desc, sql } from "drizzle-orm";
import { userHasAdminAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) {
    return error(404, "Not found");
  }

  // Load all membership types for the dropdown
  const membershipTypes = await db
    .select()
    .from(table.membershipType)
    .orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

  // add information member count to db query
  const memberships = await db
    .select({
      id: table.membershipFeePeriod.id,
      membershipTypeId: table.membershipFeePeriod.membershipTypeId,
      stripePriceId: table.membershipFeePeriod.stripePriceId,
      startDate: table.membershipFeePeriod.startDate,
      endDate: table.membershipFeePeriod.endDate,
      publishedAt: table.membershipFeePeriod.publishedAt,
      acceptsApplications: table.membershipFeePeriod.acceptsApplications,
      requiresStudentVerification: table.membershipType.requiresStudentVerification,
      memberCount: count(table.membershipObligation.memberId),
    })
    .from(table.membershipFeePeriod)
    .innerJoin(table.membershipType, sql`${table.membershipFeePeriod.membershipTypeId} = ${table.membershipType.id}`)
    .leftJoin(
      table.membershipObligation,
      sql`${table.membershipFeePeriod.id} = ${table.membershipObligation.membershipFeePeriodId}`,
    )
    .groupBy(table.membershipFeePeriod.id, table.membershipType.id)
    .orderBy(desc(table.membershipFeePeriod.startDate));

  const currentYear = new Date().getFullYear();
  // Format dates to YYYY-MM-DD for date inputs
  const formatDate = (date: Date) => date.toISOString().slice(0, 10);

  return {
    memberships: memberships.map((membership) => ({
      ...membership,
      startTime: new Date(`${membership.startDate}T00:00:00`),
      endTime: new Date(`${membership.endDate}T00:00:00`),
    })),
    membershipTypes,
    defaultValues: {
      membershipTypeId: "",
      stripePriceId: "",
      startTime: formatDate(new Date(currentYear, 7, 1, 12)),
      endTime: formatDate(new Date(currentYear + 1, 6, 31, 12)),
    },
  };
};
