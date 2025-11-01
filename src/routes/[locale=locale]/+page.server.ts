import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { schema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import * as auth from "$lib/server/auth/session";
import * as z from "zod";
import { fi, en } from "zod/locales";

async function findNextYearMembership(currentMembershipId: string) {
	const currentMembership = await db.query.membership.findFirst({
		where: eq(table.membership.id, currentMembershipId),
	});

	if (!currentMembership) {
		return null;
	}

	const nextMembership = await db.query.membership.findFirst({
		where: (membership, { and, eq, gt }) =>
			and(eq(membership.type, currentMembership.type), gt(membership.startTime, currentMembership.startTime)),
		orderBy: (membership, { asc }) => asc(membership.startTime),
	});

	return nextMembership;
}

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	const form = await superValidate(zod4(schema), {
		defaults: {
			email: event.locals.user.email,
			firstNames: event.locals.user.firstNames ?? "",
			lastName: event.locals.user.lastName ?? "",
			homeMunicipality: event.locals.user.homeMunicipality ?? "",
			preferredLanguage: event.locals.user.preferredLanguage,
			isAllowedEmails: event.locals.user.isAllowedEmails,
		},
	});

	const result = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.startTime));

	// Get all membership IDs that the user already has
	const userMembershipIds = new Set(result.map((m) => m.membership.id));

	// Check for each membership if there's a next year's membership available
	const membershipsWithRenewInfo = await Promise.all(
		result.map(async (m) => {
			const nextMembership = await findNextYearMembership(m.membership.id);
			// Only show renew button if next membership exists and user doesn't already have it
			const hasNextYearMembership = !!nextMembership && !userMembershipIds.has(nextMembership.id);

			return {
				...m.membership,
				status: m.member.status,
				unique_id: m.member.id,
				hasNextYearMembership,
			};
		}),
	);

	return { user: event.locals.user, form, memberships: membershipsWithRenewInfo };
};

export const actions: Actions = {
	saveInfo,
	signOut,
	renewMembership,
};

async function saveInfo(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	// Configure Zod locale based on user's language preference
	z.config(event.locals.locale === "fi" ? fi() : en());

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(schema));

	if (!form.valid) {
		return fail(400, { form });
	}

	const user = {
		...event.locals.user,
		...form.data,
	};

	try {
		await db
			.update(table.user)
			.set({
				// don't allow changing email here
				firstNames: user.firstNames,
				lastName: user.lastName,
				homeMunicipality: user.homeMunicipality,
				preferredLanguage: user.preferredLanguage,
				isAllowedEmails: user.isAllowedEmails,
			})
			.where(eq(table.user.id, user.id));

		return { form, success: true };
	} catch {
		return fail(500, { form, success: false, message: "Failed to save information" });
	}
}

async function signOut(event: RequestEvent) {
	if (!event.locals.session) {
		return fail(401, {
			message: "Not authenticated",
		});
	}
	await auth.invalidateSession(event.locals.session.id);
	auth.deleteSessionTokenCookie(event);

	return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
}

async function renewMembership(event: RequestEvent) {
	if (!event.locals.user) {
		return fail(401, {
			message: "Unauthorized",
		});
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(renewMembershipSchema));

	if (!form.valid) {
		return fail(400, {
			form,
			message: "Invalid form data",
		});
	}

	const currentMembershipId = form.data.membershipId;

	const nextMembership = await findNextYearMembership(currentMembershipId);

	if (!nextMembership) {
		return fail(404, {
			form,
			message: "No membership available for renewal",
		});
	}

	const paymentSession = await createSession(event.locals.user.id, nextMembership.id, false);
	if (!paymentSession?.url) {
		return fail(400, {
			form,
			message: "Could not create payment session",
		});
	}
	return redirect(303, paymentSession.url);
}
