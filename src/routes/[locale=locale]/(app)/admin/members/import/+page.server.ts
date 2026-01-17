import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// Fetch available membership types
	const memberships = await db
		.select({
			id: table.membership.id,
			type: table.membership.type,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
		})
		.from(table.membership);

	const types = Array.from(new Set(memberships.map((m) => m.type)));

	return {
		types,
		memberships,
	};
};
