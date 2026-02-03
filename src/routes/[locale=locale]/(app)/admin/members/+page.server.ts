import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, sql } from "drizzle-orm";
import type { NonEmptyArray } from "$lib/utils";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.session || !event.locals.user?.isAdmin) {
    return error(404, "Not found");
  }

  const subQuery = db
    .select({
      id: table.member.id,
      userId: table.member.userId,
      membershipId: table.member.membershipId,
      status: table.member.status,
      stripeSessionId: table.member.stripeSessionId,
      description: table.member.description,
      createdAt: table.member.createdAt,
      updatedAt: table.member.updatedAt,
      email: table.user.email,
      firstNames: table.user.firstNames,
      lastName: table.user.lastName,
      homeMunicipality: table.user.homeMunicipality,
      preferredLanguage: table.user.preferredLanguage,
      isAllowedEmails: table.user.isAllowedEmails,
      membershipTypeId: table.membership.membershipTypeId,
      membershipTypeName: table.membershipType.name,
      membershipStripePriceId: table.membership.stripePriceId,
      membershipStartTime: table.membership.startTime,
      membershipEndTime: table.membership.endTime,
    })
    .from(table.member)
    .leftJoin(table.user, sql`${table.member.userId} = ${table.user.id}`)
    .leftJoin(table.membership, sql`${table.member.membershipId} = ${table.membership.id}`)
    .leftJoin(table.membershipType, sql`${table.membership.membershipTypeId} = ${table.membershipType.id}`)
    .as("subQuery");

  const allMembers = await db.select().from(subQuery).orderBy(asc(subQuery.firstNames), asc(subQuery.lastName));

  // Group memberships by user
  const userMembershipsMap = new Map<string, NonEmptyArray<(typeof allMembers)[number]>>();
  for (const member of allMembers) {
    const userId = member.userId;
    if (userMembershipsMap.has(userId)) {
      const userMemberships = userMembershipsMap.get(userId);
      if (userMemberships) {
        userMemberships.push(member);
      }
    } else {
      userMembershipsMap.set(userId, [member]);
    }
  }

  // Convert to array with primary membership (most recent active/pending, then by date)
  const members = Array.from(userMembershipsMap.values())
    .map((userMembers) => {
      // Sort by: active/awaiting first, then by start date desc
      const sorted = userMembers.toSorted((a, b) => {
        const aIsActive = a.status === "active" || a.status === "awaiting_approval" || a.status === "awaiting_payment";
        const bIsActive = b.status === "active" || b.status === "awaiting_approval" || b.status === "awaiting_payment";

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        // Sort by start date descending (most recent first)
        return (b.membershipStartTime?.getTime() ?? 0) - (a.membershipStartTime?.getTime() ?? 0);
      }) as NonEmptyArray<(typeof userMembers)[number]>;

      // Return primary membership with all memberships attached
      const primary = sorted[0];
      return {
        ...primary,
        allMemberships: sorted,
        membershipCount: sorted.length,
      };
    })
    .toSorted((a, b) => {
      // Sort by first name, then last name
      const aFirst = (a.firstNames ?? "").toLowerCase();
      const bFirst = (b.firstNames ?? "").toLowerCase();
      if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);

      const aLast = (a.lastName ?? "").toLowerCase();
      const bLast = (b.lastName ?? "").toLowerCase();
      return aLast.localeCompare(bLast);
    });

  // Get membership types for filters
  const membershipTypes = await db
    .select()
    .from(table.membershipType)
    .orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

  // Get distinct years from memberships
  const memberships = await db
    .select({
      startTime: table.membership.startTime,
      endTime: table.membership.endTime,
    })
    .from(table.membership);

  const years = Array.from(
    new Set(memberships.flatMap((m) => [m.startTime.getFullYear(), m.endTime.getFullYear()])),
  ).toSorted((a, b) => b - a); // Most recent first

  return {
    members,
    membershipTypes,
    years,
  };
};
