import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The membership type each user held at the given time, for all users or only the given ones.
 * Users without an active membership covering that time are absent from the map. With overlapping
 * memberships, the one that started last wins.
 *
 * Meeting attendance reads memberships only through this function, so a change in the membership
 * model needs to be ported here.
 */
export async function membershipTypesAt(executor: Executor, at: Date, userIds?: string[]) {
  if (userIds?.length === 0) return new Map<string, string>();
  const rows = await executor
    .select({ userId: table.member.userId, membershipTypeId: table.membership.membershipTypeId })
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .where(
      and(
        userIds ? inArray(table.member.userId, userIds) : undefined,
        eq(table.member.status, "active"),
        lte(table.membership.startTime, at),
        gte(table.membership.endTime, at),
      ),
    )
    // Later starts overwrite earlier ones in the map
    .orderBy(asc(table.membership.startTime));
  const types = new Map<string, string>();
  for (const row of rows) if (row.userId) types.set(row.userId, row.membershipTypeId);
  return types;
}

/** The membership type a user held at the given time, or null when they had no active membership. */
export async function membershipTypeAt(executor: Executor, userId: string, at: Date) {
  return (await membershipTypesAt(executor, at, [userId])).get(userId) ?? null;
}
