import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import { createSession } from "$lib/server/payment/session";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";
import { payMembershipSchema } from "./schema";
import { getLL } from "$lib/server/i18n";

export const payMembership = form(payMembershipSchema, async ({ membershipId, description }) => {
  const event = getRequestEvent();

  const LL = getLL(event.locals.locale);

  if (!event.locals.user) {
    error(401, LL.error.unauthorized());
  }

  const membership = await db.query.membershipFeePeriod.findFirst({
    where: { id: membershipId, acceptsApplications: true },
    with: { membershipType: true },
  });
  if (!membership?.publishedAt || !membership.membershipType.purchasable) {
    error(400, LL.membership.noAvailableMemberships());
  }

  // Description is required for memberships without student verification
  const trimmedDescription = description?.trim() || null;
  if (!membership.membershipType.requiresStudentVerification && !trimmedDescription) {
    error(400, LL.membership.descriptionRequired());
  }

  if (membership.membershipType.requiresStudentVerification) {
    // Check primary email domain
    const primaryEmailDomain = event.locals.user.email.split("@", 2)[1]?.toLowerCase();
    const isPrimaryAalto = primaryEmailDomain === "aalto.fi";

    // Check secondary emails
    const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
    const aaltoEmail = secondaryEmails.find((e) => e.domain === "aalto.fi");
    const hasValidSecondaryAalto = aaltoEmail ? isSecondaryEmailValid(aaltoEmail) : false;

    // Primary email is always valid, secondary needs verification check
    const hasValidAaltoEmail = isPrimaryAalto || hasValidSecondaryAalto;

    if (!hasValidAaltoEmail) {
      error(400, LL.membership.studentVerificationRequired());
    }
  }

  const paymentSession = await createSession(
    event.locals.user.id,
    membershipId,
    event.locals.locale,
    trimmedDescription,
  );
  if (!paymentSession?.url) {
    error(400, LL.membership.paymentSessionFailed());
  }
  redirect(303, paymentSession.url);
});
