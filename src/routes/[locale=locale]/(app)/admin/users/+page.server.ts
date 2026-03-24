import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, sql } from "drizzle-orm";

export const load: PageServerLoad = async () => {
  // Fetch all users with activity info
  // Sort by admin role (admin first, then readonly, then none), then by email
  const users = await db
    .select({
      id: table.user.id,
      email: table.user.email,
      firstNames: table.user.firstNames,
      lastName: table.user.lastName,
      adminRole: table.user.adminRole,
      createdAt: table.user.createdAt,
      lastActiveAt: table.user.lastActiveAt,
    })
    .from(table.user)
    .orderBy(
      sql`CASE ${table.user.adminRole} WHEN 'admin' THEN 0 WHEN 'readonly' THEN 1 ELSE 2 END`,
      asc(table.user.email),
    );

  return {
    users,
  };
};
