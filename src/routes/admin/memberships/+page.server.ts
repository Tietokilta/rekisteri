import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, desc } from "drizzle-orm";
import { fail, superValidate } from "sveltekit-superforms";
import { zod } from "sveltekit-superforms/adapters";
import { createSchema, deleteSchema } from "./schema";
import { sql, eq } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const currentYear = new Date().getFullYear();

	const form = await superValidate(zod(createSchema), {
		defaults: {
			type: "",
			stripePriceId: "",
			startTime: new Date(currentYear, 7, 1, 12).toISOString().split("T")[0],
			endTime: new Date(currentYear + 1, 6, 31, 12).toISOString().split("T")[0],
			priceCents: 0,
		},
	});

	// add information member count to db query
	const memberships = await db
		.select({
			id: table.membership.id,
			type: table.membership.type,
			stripePriceId: table.membership.stripePriceId,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
			priceCents: table.membership.priceCents,
			memberCount: count(table.member.userId),
		})
		.from(table.membership)
		.leftJoin(table.member, sql`${table.membership.id} = ${table.member.membershipId}`)
		.groupBy(table.membership.id)
		.orderBy(desc(table.membership.startTime));

	const types = new Set(memberships.map((m) => m.type));

	return {
		memberships,
		types,
		form,
	};
};

export const actions: Actions = {
	createMembership,
	deleteMembership,
};

async function createMembership(event: RequestEvent) {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod(createSchema));

	await db
		.insert(table.membership)
		.values({
			id: crypto.randomUUID(),
			type: form.data.type,
			stripePriceId: form.data.stripePriceId,
			startTime: new Date(form.data.startTime),
			endTime: new Date(form.data.endTime),
			priceCents: form.data.priceCents,
		})
		.execute();

	return {
		form,
	};
}

async function deleteMembership(event: RequestEvent) {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod(deleteSchema));

	const memberCount = await db
		.select({ count: count() })
		.from(table.member)
		.where(eq(table.member.membershipId, form.data.id))
		.then((result) => result[0].count);

	if (memberCount > 0) {
		return fail(400, {
			form,
			message: "Cannot delete membership with active members",
		});
	}

	await db.delete(table.membership).where(eq(table.membership.id, form.data.id)).execute();

	return { form };
}
