import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, desc, eq, max } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// Fetch all users with their most recent session info
	const users = await db
		.select({
			id: table.user.id,
			email: table.user.email,
			firstNames: table.user.firstNames,
			lastName: table.user.lastName,
			isAdmin: table.user.isAdmin,
			createdAt: table.user.createdAt,
			lastSessionExpiresAt: max(table.session.expiresAt).as("last_session_expires_at"),
		})
		.from(table.user)
		.leftJoin(table.session, eq(table.user.id, table.session.userId))
		.groupBy(table.user.id)
		.orderBy(desc(table.user.isAdmin), asc(table.user.email));

	return {
		users,
	};
};
