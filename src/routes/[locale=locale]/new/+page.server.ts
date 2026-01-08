import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, gt } from "drizzle-orm";
import { schema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { valibot } from "sveltekit-superforms/adapters";
import { createSession } from "$lib/server/payment/session";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	const form = await superValidate(valibot(schema), {
		defaults: {
			membershipId: "",
		},
	});

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
		form,
		memberships,
		availableMemberships,
		hasValidAaltoEmail,
		hasExpiredAaltoEmail,
		aaltoEmailExpiry: isPrimaryAalto ? null : aaltoSecondaryEmail?.expiresAt,
	};
};

export const actions: Actions = {
	payMembership,
};

async function payMembership(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, valibot(schema));

	const membershipId = form.data.membershipId;

	// Check if membership requires student verification
	const [membership] = await db.select().from(table.membership).where(eq(table.membership.id, membershipId));

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
			return fail(400, {
				form,
				message: "Student verification required. Please add and verify your Aalto email address.",
			});
		}
	}

	const paymentSession = await createSession(event.locals.user.id, membershipId, event.locals.locale);
	if (!paymentSession?.url) {
		return fail(400, {
			form,
			message: "Could not create payment session",
		});
	}
	return redirect(303, paymentSession.url);
}
