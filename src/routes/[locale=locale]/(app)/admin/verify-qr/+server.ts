import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { verifyQrToken } from "$lib/server/attendance/qr-token";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, and, or } from "drizzle-orm";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) {
    return error(403, "Admin access required");
  }

  const { token } = await request.json();

  if (!token || typeof token !== "string") {
    return error(400, "Invalid token");
  }

  // Verify token and get user ID
  const userId = await verifyQrToken(token);

  if (!userId) {
    return error(404, "Invalid QR code");
  }

  // Get user with membership info
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: {
      id: true,
      email: true,
      firstNames: true,
      lastName: true,
      homeMunicipality: true,
    },
  });

  if (!user) {
    return error(404, "User not found");
  }

  // Get active or most recent membership
  const memberships = await db
    .select({
      id: table.member.id,
      status: table.member.status,
      createdAt: table.member.createdAt,
      membershipType: {
        id: table.membershipType.id,
        name: table.membershipType.name,
      },
      membership: {
        startTime: table.membership.startTime,
        endTime: table.membership.endTime,
      },
    })
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
    .where(
      and(eq(table.member.userId, userId), or(eq(table.member.status, "active"), eq(table.member.status, "expired"))),
    )
    .orderBy(desc(table.membership.startTime))
    .limit(3);

  return json({
    user,
    memberships,
  });
};
