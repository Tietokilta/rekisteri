import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, asc, sql } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// Fetch membership types for validation
	const membershipTypes = await db
		.select()
		.from(table.membershipType)
		.orderBy(asc(sql`${table.membershipType.name}->>'fi'`));

	// Fetch memberships with their type info
	const membershipResult = await db
		.select()
		.from(table.membership)
		.innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id));

	const memberships = membershipResult.map((r) => ({
		...r.membership,
		membershipType: r.membership_type,
	}));

	// Build a list of valid type names (both fi and en)
	const typeNames = membershipTypes.flatMap((t) => [t.name.fi, t.name.en]);

	return {
		membershipTypes,
		typeNames,
		memberships,
	};
};
