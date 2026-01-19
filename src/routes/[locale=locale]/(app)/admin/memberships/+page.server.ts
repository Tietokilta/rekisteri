import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, count, desc, sql } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// Load all membership types for the dropdown
	const membershipTypes = await db
		.select()
		.from(table.membershipType)
		.orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

	// add information member count to db query
	const memberships = await db
		.select({
			id: table.membership.id,
			membershipTypeId: table.membership.membershipTypeId,
			stripePriceId: table.membership.stripePriceId,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
			requiresStudentVerification: table.membership.requiresStudentVerification,
			memberCount: count(table.member.userId),
		})
		.from(table.membership)
		.leftJoin(table.member, sql`${table.membership.id} = ${table.member.membershipId}`)
		.groupBy(table.membership.id)
		.orderBy(desc(table.membership.startTime));

	const currentYear = new Date().getFullYear();
	// Format dates to YYYY-MM-DD for date inputs
	const formatDate = (date: Date) => date.toISOString().slice(0, 10);

	return {
		memberships,
		membershipTypes,
		defaultValues: {
			membershipTypeId: "",
			stripePriceId: "",
			startTime: formatDate(new Date(currentYear, 7, 1, 12)),
			endTime: formatDate(new Date(currentYear + 1, 6, 31, 12)),
			requiresStudentVerification: false,
		},
	};
};
