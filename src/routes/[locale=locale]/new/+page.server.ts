import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { route } from "$lib/ROUTES";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc, gt } from "drizzle-orm";
import { schema } from "./schema";
import { superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { createSession } from "$lib/server/payment/session";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
	}

	const form = await superValidate(zod4(schema), {
		defaults: {
			membershipId: "",
		},
	});

	const result = await db
		.select()
		.from(table.member)
		.innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
		.innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.startTime));

	const memberships = result.map((m) => ({
		...m.membership,
		membershipType: m.membership_type,
		status: m.member.status,
	}));

	// Get latest membership for display
	const latestMembership = memberships[0] || null;

	const availableMembershipsResult = await db
		.select()
		.from(table.membership)
		.innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
		.where(gt(table.membership.endTime, new Date()));

	const availableMemberships = availableMembershipsResult.map((m) => ({
		...m.membership,
		membershipType: m.membership_type,
	}));

	// Filter out memberships where user already has active or awaiting approval status for the same period
	const filteredMemberships = availableMemberships.filter((available) => {
		// Check if user has an active or pending membership for this exact membership period
		const hasExisting = memberships.some(
			(existing) =>
				existing.id === available.id &&
				(existing.status === "active" || existing.status === "awaiting_approval"),
		);
		return !hasExisting;
	});

	return { user: event.locals.user, form, memberships, availableMemberships: filteredMemberships, latestMembership };
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
	const form = await superValidate(formData, zod4(schema));

	const membershipId = form.data.membershipId;
	const paymentSession = await createSession(event.locals.user.id, membershipId, event.locals.locale);
	if (!paymentSession?.url) {
		return fail(400, {
			form,
			message: "Could not create payment session",
		});
	}
	return redirect(303, paymentSession.url);
}
