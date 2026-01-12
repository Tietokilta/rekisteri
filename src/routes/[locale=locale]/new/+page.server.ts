import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, gt } from "drizzle-orm";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	const result = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.startTime));

	const memberships = result.map((m) => ({
		...m.membership,
		status: m.member.status,
	}));

	const availableMemberships = await db.select().from(table.membership).where(gt(table.membership.endTime, new Date()));

	// Check for valid aalto.fi email (primary or secondary)
	const primaryEmailDomain = event.locals.user.email.split("@")[1]?.toLowerCase();
	const isPrimaryAalto = primaryEmailDomain === "aalto.fi";

	const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
	const aaltoSecondaryEmail = secondaryEmails.find((e) => e.domain === "aalto.fi");
	const hasValidSecondaryAalto = aaltoSecondaryEmail ? isSecondaryEmailValid(aaltoSecondaryEmail) : false;
	const hasExpiredSecondaryAalto = aaltoSecondaryEmail && !isSecondaryEmailValid(aaltoSecondaryEmail);

	// Primary email is always considered valid (no expiration tracking for primary)
	// TODO: Consider adding expiration tracking for primary emails with expiring domains
	const hasValidAaltoEmail = isPrimaryAalto || hasValidSecondaryAalto;
	const hasExpiredAaltoEmail = !isPrimaryAalto && hasExpiredSecondaryAalto;

	return {
		user: event.locals.user,
		memberships,
		availableMemberships,
		hasValidAaltoEmail,
		hasExpiredAaltoEmail,
		aaltoEmailExpiry: isPrimaryAalto ? null : aaltoSecondaryEmail?.expiresAt,
	};
};
