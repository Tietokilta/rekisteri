import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { createSession } from "$lib/server/payment/session";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";
import { payMembershipSchema } from "./schema";

export const payMembership = form(payMembershipSchema, async ({ membershipId }) => {
	const event = getRequestEvent();

	if (!event.locals.user) {
		error(401, "Unauthorized");
	}

	// Check if membership requires student verification
	const [membership] = await db.select().from(table.membership).where(eq(table.membership.id, membershipId));

	// Get user's existing memberships to check for overlaps
	const userMemberships = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.endTime));

	// Get the latest end date from user's existing memberships
	const latestEndDate = userMemberships[0]?.membership?.endTime ?? null;

	// Check for overlapping memberships
	if (latestEndDate && membership && membership.startTime < latestEndDate) {
		error(400, "You already have a membership during this period");
	}

	if (membership?.requiresStudentVerification) {
		// Check primary email domain
		const primaryEmailDomain = event.locals.user.email.split("@")[1]?.toLowerCase();
		const isPrimaryAalto = primaryEmailDomain === "aalto.fi";

		// Check secondary emails
		const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
		const aaltoEmail = secondaryEmails.find((e) => e.domain === "aalto.fi");
		const hasValidSecondaryAalto = aaltoEmail ? isSecondaryEmailValid(aaltoEmail) : false;

		// Primary email is always valid, secondary needs verification check
		const hasValidAaltoEmail = isPrimaryAalto || hasValidSecondaryAalto;

		if (!hasValidAaltoEmail) {
			error(400, "Student verification required. Please add and verify your Aalto email address.");
		}
	}

	const paymentSession = await createSession(event.locals.user.id, membershipId, event.locals.locale);
	if (!paymentSession?.url) {
		error(400, "Could not create payment session");
	}
	redirect(303, paymentSession.url);
});
