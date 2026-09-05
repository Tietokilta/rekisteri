import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";

function todayInHelsinki() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user) {
    return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
  }
  const user = event.locals.user;

  const member = await db.query.member.findFirst({
    where: { userId: user.id },
    with: { obligations: { with: { payments: true } } },
  });

  const availableResult = await db
    .select()
    .from(table.membershipFeePeriod)
    .innerJoin(table.membershipType, eq(table.membershipFeePeriod.membershipTypeId, table.membershipType.id))
    .where(
      and(
        eq(table.membershipFeePeriod.acceptsApplications, true),
        gte(table.membershipFeePeriod.endDate, todayInHelsinki()),
        eq(table.membershipType.purchasable, true),
      ),
    );

  const blockedByPendingApplication = member?.status === "awaiting_payment" || member?.status === "awaiting_approval";
  const availableFeePeriods = blockedByPendingApplication
    ? []
    : availableResult
        .filter(({ membership_fee_period: period }) => {
          const obligation = member?.obligations.find((item) => item.membershipFeePeriodId === period.id);
          return !obligation?.payments.some(
            (payment) => payment.status === "succeeded" && !payment.refundConfirmedAt && !payment.invalidatedAt,
          );
        })
        .map(({ membership_fee_period: period, membership_type: membershipType }) => ({
          ...period,
          membershipType,
          requiresBoardApproval: member?.status !== "active" || member.membershipTypeId !== period.membershipTypeId,
        }));

  const primaryEmailDomain = user.email.split("@", 2)[1]?.toLowerCase();
  const isPrimaryAalto = primaryEmailDomain === "aalto.fi";
  const secondaryEmails = await getUserSecondaryEmails(user.id);
  const aaltoSecondaryEmail = secondaryEmails.find((email) => email.domain === "aalto.fi");
  const hasValidSecondaryAalto = aaltoSecondaryEmail ? isSecondaryEmailValid(aaltoSecondaryEmail) : false;
  const hasExpiredSecondaryAalto = aaltoSecondaryEmail && !isSecondaryEmailValid(aaltoSecondaryEmail);

  return {
    user,
    member: member ? { id: member.id, status: member.status } : null,
    availableFeePeriods,
    hasValidAaltoEmail: isPrimaryAalto || hasValidSecondaryAalto,
    hasExpiredAaltoEmail: !isPrimaryAalto && hasExpiredSecondaryAalto,
    aaltoEmailExpiry: isPrimaryAalto ? null : aaltoSecondaryEmail?.expiresAt,
  };
};
