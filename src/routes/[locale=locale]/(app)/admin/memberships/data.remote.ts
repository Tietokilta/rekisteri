import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, eq } from "drizzle-orm";
import { createMembershipSchema, deleteMembershipSchema } from "./schema";

export const createMembership = form(createMembershipSchema, async (data) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	await db
		.insert(table.membership)
		.values({
			id: crypto.randomUUID(),
			type: data.type,
			stripePriceId: data.stripePriceId,
			startTime: new Date(data.startTime),
			endTime: new Date(data.endTime),
			priceCents: data.priceCents,
			requiresStudentVerification: data.requiresStudentVerification,
		})
		.execute();

	return { success: true };
});

export const deleteMembership = form(deleteMembershipSchema, async ({ id }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const memberCount = await db
		.select({ count: count() })
		.from(table.member)
		.where(eq(table.member.membershipId, id))
		.then((result) => result[0]?.count ?? 0);

	if (memberCount > 0) {
		error(400, "Cannot delete membership with active members");
	}

	await db.delete(table.membership).where(eq(table.membership.id, id)).execute();

	return { success: true };
});
