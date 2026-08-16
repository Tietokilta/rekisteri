import { error } from "@sveltejs/kit";
import { command, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import { verifyQrToken } from "$lib/server/attendance/qr-token";
import { verifyQrSchema } from "./schema";
import { getLL } from "$lib/server/i18n";
import { userHasAdminAccess } from "$lib/server/auth/admin";
import { auditFromEvent } from "$lib/server/audit";

export const verifyQr = command(verifyQrSchema, async ({ token }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  const userId = await verifyQrToken(token);

  if (!userId) {
    error(422, LL.admin.verifyQr.invalidQr());
  }

  const user = await db.query.user.findFirst({
    where: { id: userId },
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

  const member = await db.query.member.findFirst({
    where: { userId },
    with: { membershipType: true },
  });

  const memberships =
    member?.membershipType && member.status === "active"
      ? [
          {
            id: member.id,
            status: member.status,
            membershipType: member.membershipType,
            startedAt: member.currentMembershipStartedAt,
            endedAt: member.currentMembershipEndedAt,
          },
        ]
      : [];

  await auditFromEvent(event, "admin.verify_qr", {
    targetType: "user",
    targetId: userId,
  });

  return { user, memberships };
});
