import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// Load membership types
	const membershipTypes = await db
		.select()
		.from(table.membershipType)
		.orderBy(sql`${table.membershipType.name}->>'fi'`);

	// Load memberships with member count
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

	const currentYear = new Date().getFullYear();
	const formatDate = (date: Date) => date.toISOString().slice(0, 10);

	return {
		memberships,
		membershipTypes,
		defaultValues: {
			membershipTypeId: "",
			stripePriceId: "",
			startTime: formatDate(new Date(currentYear, 7, 1, 12)),
			endTime: formatDate(new Date(currentYear + 1, 6, 31, 12)),
			priceCents: 0,
			requiresStudentVerification: false,
		},
	};
};
