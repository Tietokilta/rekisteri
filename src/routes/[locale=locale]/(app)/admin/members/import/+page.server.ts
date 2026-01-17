import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, sql } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// Fetch available membership types and memberships
	const membershipTypes = await db.select().from(table.membershipType);

	const memberships = await db
		.select({
			id: table.membership.id,
			membershipTypeId: table.membership.membershipTypeId,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
			typeName: {
				fi: sql<string>`${table.membershipType.name}->>'fi'`,
				en: sql<string>`${table.membershipType.name}->>'en'`,
			},
		})
		.from(table.membership)
		.leftJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id));

	return {
		membershipTypes,
		memberships,
	};
};
