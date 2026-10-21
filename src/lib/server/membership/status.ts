import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { PostgresJsDatabase, PostgresJsTransaction } from "drizzle-orm/postgres-js";
import type { Schema } from "$lib/server/db";
import * as table from "$lib/server/db/schema";

type Executor = PostgresJsDatabase<Schema> | PostgresJsTransaction<Schema>;

/**
 * The membership type each user held at the given time, for all users or only the given ones.
 * Users who are not members are absent from the map.
 *
 * A user is a member while they have an `active` member row: membership does not end with its fee
 * period, only when an admin marks it resigned. The type comes from the latest membership that had
 * started by then, or from the earliest upcoming one for members whose first period has not started.
 * Member rows created after the given time are ignored.
 *
 * This is the one place that decides who is a member. Code that needs the answer (meeting
 * attendance, QR verification) reads it from here, so a change in the membership model is ported
 * only here.
 */
export async function membershipTypesAt(executor: Executor, at: Date, userIds?: string[]) {
  if (userIds?.length === 0) return new Map<string, string>();
  const rows = await executor
    .select({
      userId: table.member.userId,
      membershipTypeId: table.membership.membershipTypeId,
      startTime: table.membership.startTime,
    })
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .where(
      and(
        userIds ? inArray(table.member.userId, userIds) : undefined,
        eq(table.member.status, "active"),
        // Membership bought later did not exist yet, e.g. when an older entry is corrected
        lte(table.member.createdAt, at),
      ),
    )
    .orderBy(asc(table.membership.startTime), asc(table.membership.id));
  const types = new Map<string, string>();
  for (const row of rows) {
    if (!row.userId) continue;
    // Later started memberships overwrite earlier ones; upcoming ones only fill a gap
    if (row.startTime <= at || !types.has(row.userId)) types.set(row.userId, row.membershipTypeId);
  }
  return types;
}

/** The membership type a user held at the given time, or null when they were not a member. */
export async function membershipTypeAt(executor: Executor, userId: string, at: Date) {
  return (await membershipTypesAt(executor, at, [userId])).get(userId) ?? null;
}
