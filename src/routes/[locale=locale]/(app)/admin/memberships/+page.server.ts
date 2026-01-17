import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getStripePriceMetadata } from "$lib/api/stripe.remote";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	// add information member count to db query
	const memberships = await db
		.select({
			id: table.membership.id,
			type: table.membership.type,
			stripePriceId: table.membership.stripePriceId,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
			memberCount: count(table.member.userId),
		})
		.from(table.membership)
		.leftJoin(table.member, sql`${table.membership.id} = ${table.member.membershipId}`)
		.groupBy(table.membership.id)
		.orderBy(desc(table.membership.startTime));

	// Batch fetch Stripe price metadata for all memberships
	// Using Promise.all to fetch all prices in parallel
	const priceMetadata = await Promise.all(memberships.map((m) => getStripePriceMetadata(m.stripePriceId)));

	// Create a map of priceId to metadata for easy lookup
	const priceMetadataMap = new Map(memberships.map((m, index) => [m.stripePriceId, priceMetadata[index]]));

	const types = new Set(memberships.map((m) => m.type));

	const currentYear = new Date().getFullYear();
	// Format dates to YYYY-MM-DD for date inputs
	const formatDate = (date: Date) => date.toISOString().slice(0, 10);

	return {
		memberships,
		priceMetadataMap: Object.fromEntries(priceMetadataMap),
		types,
		defaultValues: {
			type: "",
			stripePriceId: "",
			startTime: formatDate(new Date(currentYear, 7, 1, 12)),
			endTime: formatDate(new Date(currentYear + 1, 6, 31, 12)),
			requiresStudentVerification: false,
		},
	};
};
