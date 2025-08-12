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
import { localizeHref } from "$lib/paraglide/runtime";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return redirect(302, localizeHref(route("/sign-in")));
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
		.where(eq(table.member.userId, event.locals.user.id))
		.orderBy(desc(table.membership.startTime));

	const memberships = result.map((m) => ({
		...m.membership,
		status: m.member.status,
	}));

	const availableMemberships = await db.select().from(table.membership).where(gt(table.membership.endTime, new Date()));

	return { user: event.locals.user, form, memberships, availableMemberships };
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
	const paymentSession = await createSession(event.locals.user.id, membershipId);
	if (!paymentSession?.url) {
		return fail(400, {
			form,
			message: "Could not create payment session",
		});
	}
	return redirect(303, paymentSession.url);
}
