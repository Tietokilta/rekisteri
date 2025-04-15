import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, sql } from "drizzle-orm";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const subQuery = db
		.select({
			id: table.user.id,
			firstNames: table.user.firstNames,
			lastName: table.user.lastName,
			homeMunicipality: table.user.homeMunicipality,
			isAllowedEmails: table.user.isAllowedEmails,
			membershipType: table.membership.type,
		})
		.from(table.member)
		.leftJoin(table.user, sql`${table.member.userId} = ${table.user.id}`)
		.leftJoin(table.membership, sql`${table.member.membershipId} = ${table.membership.id}`)
		.as("subQuery");

	const members = await db.select().from(subQuery).orderBy(asc(subQuery.firstNames), asc(subQuery.lastName));

	return {
		members,
	};
};
