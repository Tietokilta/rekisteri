import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";

export const load: PageServerLoad = async (event) => {
  // Import is a write-only operation, so only full admins can access it
  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    return error(404, "Not found");
  }

  // Fetch membership types for validation
  const membershipTypes = await db
    .select()
    .from(table.membershipType)
    .orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

  // Fetch memberships with their type info
  const membershipResult = await db
    .select()
    .from(table.membershipFeePeriod)
    .innerJoin(table.membershipType, eq(table.membershipFeePeriod.membershipTypeId, table.membershipType.id));

  const memberships = membershipResult.map((r) => ({
    ...r.membership_fee_period,
    membershipType: r.membership_type,
    // PostgreSQL DATE values have no timezone. Represent them consistently as
    // UTC midnight so browser-side equality checks do not depend on locale.
    startTime: new Date(r.membership_fee_period.startDate),
    endTime: new Date(r.membership_fee_period.endDate),
  }));

  // Build a list of valid type IDs
  const typeIds = membershipTypes.map((t) => t.id);

  return {
    membershipTypes,
    typeIds,
    memberships,
  };
};
