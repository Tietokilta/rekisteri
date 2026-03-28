import { error } from "@sveltejs/kit";
import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { verifyQrToken } from "$lib/server/attendance/qr-token";
import { verifyQrSchema } from "./schema";
import { getLL } from "$lib/server/i18n";
import { hasAdminAccess } from "$lib/server/auth/admin";
import { auditFromEvent } from "$lib/server/audit";

export const verifyQr = command(verifyQrSchema, async ({ token }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !hasAdminAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  const userId = await verifyQrToken(token);

  if (!userId) {
    error(422, LL.admin.verifyQr.invalidQr());
  }

  const user = await db.query.user.findFirst({
    where: eq(table.user.id, userId),
    columns: {
      id: true,
      email: true,
      firstNames: true,
      lastName: true,
    },
  });

  if (!user) {
    error(404, LL.error.resourceNotFound());
  }

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
      and(eq(table.member.userId, userId), or(eq(table.member.status, "active"), eq(table.member.status, "resigned"))),
    )
    .orderBy(desc(table.membership.startTime))
    .limit(3);

  await auditFromEvent(event, "admin.verify_qr", {
    targetType: "user",
    targetId: userId,
  });

  return { user, memberships };
});
