import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad, RequestEvent } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, desc } from "drizzle-orm";
import { fail, superValidate } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { createSchema, editSchema, deleteSchema } from "./schema";
import { sql, eq } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const currentYear = new Date().getFullYear();

	const form = await superValidate(zod4(createSchema), {
		defaults: {
			membershipTypeId: "",
			stripePriceId: "",
			startTime: new Date(currentYear, 7, 1, 12).toISOString().split("T")[0],
			endTime: new Date(currentYear + 1, 6, 31, 12).toISOString().split("T")[0],
			priceCents: 0,
			requiresStudentVerification: false,
		},
	});

	// Load membership types
	const membershipTypes = await db.select().from(table.membershipType).orderBy(table.membershipType.nameFi);

	// Load memberships with member count and membership type info
	const memberships = await db
		.select({
			id: table.membership.id,
			membershipTypeId: table.membership.membershipTypeId,
			stripePriceId: table.membership.stripePriceId,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
			priceCents: table.membership.priceCents,
			requiresStudentVerification: table.membership.requiresStudentVerification,
			memberCount: count(table.member.userId),
		})
		.from(table.membership)
		.leftJoin(table.member, sql`${table.membership.id} = ${table.member.membershipId}`)
		.groupBy(table.membership.id)
		.orderBy(desc(table.membership.startTime));

	return {
		memberships,
		membershipTypes,
		form,
	};
};

export const actions: Actions = {
	createMembership,
	editMembership,
	deleteMembership,
};

async function createMembership(event: RequestEvent) {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(createSchema));

	if (!form.valid) {
		return fail(400, { form });
	}

	await db
		.insert(table.membership)
		.values({
			id: crypto.randomUUID(),
			membershipTypeId: form.data.membershipTypeId,
			stripePriceId: form.data.stripePriceId,
			startTime: new Date(form.data.startTime),
			endTime: new Date(form.data.endTime),
			priceCents: form.data.priceCents,
			requiresStudentVerification: form.data.requiresStudentVerification,
		})
		.execute();

	return {
		form,
	};
}

async function editMembership(event: RequestEvent) {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(editSchema));

	if (!form.valid) {
		return fail(400, { form });
	}

	// Check if there are any members tied to this membership
	const memberCount = await db
		.select({ count: count() })
		.from(table.member)
		.where(eq(table.member.membershipId, form.data.id))
		.then((result) => result[0]?.count ?? 0);

	if (memberCount > 0) {
		return fail(400, {
			form,
			message: "Cannot edit membership with active members",
		});
	}

	await db
		.update(table.membership)
		.set({
			membershipTypeId: form.data.membershipTypeId,
			stripePriceId: form.data.stripePriceId,
			startTime: new Date(form.data.startTime),
			endTime: new Date(form.data.endTime),
			priceCents: form.data.priceCents,
			requiresStudentVerification: form.data.requiresStudentVerification,
		})
		.where(eq(table.membership.id, form.data.id))
		.execute();

	return { form };
}

async function deleteMembership(event: RequestEvent) {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const formData = await event.request.formData();
	const form = await superValidate(formData, zod4(deleteSchema));

	const memberCount = await db
		.select({ count: count() })
		.from(table.member)
		.where(eq(table.member.membershipId, form.data.id))
		.then((result) => result[0]?.count ?? 0);

	if (memberCount > 0) {
		return fail(400, {
			form,
			message: "Cannot delete membership with active members",
		});
	}

	await db.delete(table.membership).where(eq(table.membership.id, form.data.id)).execute();

	return { form };
}
