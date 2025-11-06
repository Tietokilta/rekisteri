import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { auditMemberAction } from "$lib/server/audit";
import type { NonEmptyArray } from "$lib/utils";

export const load: PageServerLoad = async (event) => {
	if (!event.locals.session || !event.locals.user?.isAdmin) {
		return error(404, "Not found");
	}

	const subQuery = db
		.select({
			id: table.member.id,
			userId: table.member.userId,
			membershipId: table.member.membershipId,
			status: table.member.status,
			stripeSessionId: table.member.stripeSessionId,
			createdAt: table.member.createdAt,
			updatedAt: table.member.updatedAt,
			email: table.user.email,
			firstNames: table.user.firstNames,
			lastName: table.user.lastName,
			homeMunicipality: table.user.homeMunicipality,
			isAllowedEmails: table.user.isAllowedEmails,
			membershipType: table.membership.type,
			membershipStartTime: table.membership.startTime,
			membershipEndTime: table.membership.endTime,
			membershipPriceCents: table.membership.priceCents,
		})
		.from(table.member)
		.leftJoin(table.user, sql`${table.member.userId} = ${table.user.id}`)
		.leftJoin(table.membership, sql`${table.member.membershipId} = ${table.membership.id}`)
		.as("subQuery");

	const allMembers = await db.select().from(subQuery).orderBy(asc(subQuery.firstNames), asc(subQuery.lastName));

	// Group memberships by user
	const userMembershipsMap = new Map<string, NonEmptyArray<(typeof allMembers)[number]>>();
	for (const member of allMembers) {
		const userId = member.userId;
		if (userMembershipsMap.has(userId)) {
			const userMemberships = userMembershipsMap.get(userId);
			if (userMemberships) {
				userMemberships.push(member);
			}
		} else {
			userMembershipsMap.set(userId, [member]);
		}
	}

	// Convert to array with primary membership (most recent active/pending, then by date)
	const members = Array.from(userMembershipsMap.values())
		.map((userMembers) => {
			// Sort by: active/awaiting first, then by start date desc
			const sorted = userMembers.toSorted((a, b) => {
				const aIsActive = a.status === "active" || a.status === "awaiting_approval" || a.status === "awaiting_payment";
				const bIsActive = b.status === "active" || b.status === "awaiting_approval" || b.status === "awaiting_payment";

				if (aIsActive && !bIsActive) return -1;
				if (!aIsActive && bIsActive) return 1;

				// Sort by start date descending (most recent first)
				return (b.membershipStartTime?.getTime() ?? 0) - (a.membershipStartTime?.getTime() ?? 0);
			}) as NonEmptyArray<(typeof userMembers)[number]>;

			// Return primary membership with all memberships attached
			const primary = sorted[0];
			return {
				...primary,
				allMemberships: sorted,
				membershipCount: sorted.length,
			};
		})
		.toSorted((a, b) => {
			// Sort by first name, then last name
			const aFirst = (a.firstNames ?? "").toLowerCase();
			const bFirst = (b.firstNames ?? "").toLowerCase();
			if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);

			const aLast = (a.lastName ?? "").toLowerCase();
			const bLast = (b.lastName ?? "").toLowerCase();
			return aLast.localeCompare(bLast);
		});

	// Get distinct membership types for filters
	const memberships = await db
		.select({
			id: table.membership.id,
			type: table.membership.type,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
		})
		.from(table.membership)
		.orderBy(asc(table.membership.startTime));

	// Extract unique types and years
	const membershipTypes = Array.from(new Set(memberships.map((m) => m.type)));
	const years = Array.from(
		new Set(memberships.flatMap((m) => [m.startTime.getFullYear(), m.endTime.getFullYear()])),
	).toSorted((a, b) => b - a); // Most recent first

	return {
		members,
		membershipTypes,
		years,
	};
};

export const actions: Actions = {
	approve: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const memberId = formData.get("memberId");

		if (!memberId || typeof memberId !== "string") {
			return fail(400, { success: false, message: "Member ID is required" });
		}

		try {
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, memberId),
			});

			if (!member) {
				return fail(404, { success: false, message: "Member not found" });
			}

			if (member.status !== "awaiting_approval") {
				return fail(400, {
					success: false,
					message: "Member is not awaiting approval",
				});
			}

			await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

			await auditMemberAction(event, "member.approve", memberId, {
				previousStatus: member.status,
			});

			return { success: true, message: "Member approved successfully" };
		} catch (err) {
			console.error("Error approving member:", err);
			return fail(500, { success: false, message: "Failed to approve member" });
		}
	},

	reject: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const memberId = formData.get("memberId");

		if (!memberId || typeof memberId !== "string") {
			return fail(400, { success: false, message: "Member ID is required" });
		}

		try {
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, memberId),
			});

			if (!member) {
				return fail(404, { success: false, message: "Member not found" });
			}

			await db.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, memberId));

			await auditMemberAction(event, "member.reject", memberId, {
				previousStatus: member.status,
			});

			return { success: true, message: "Member rejected successfully" };
		} catch (err) {
			console.error("Error rejecting member:", err);
			return fail(500, { success: false, message: "Failed to reject member" });
		}
	},

	markExpired: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const memberId = formData.get("memberId");

		if (!memberId || typeof memberId !== "string") {
			return fail(400, { success: false, message: "Member ID is required" });
		}

		try {
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, memberId),
			});

			if (!member) {
				return fail(404, { success: false, message: "Member not found" });
			}

			await db.update(table.member).set({ status: "expired" }).where(eq(table.member.id, memberId));

			await auditMemberAction(event, "member.expire", memberId, {
				previousStatus: member.status,
			});

			return { success: true, message: "Member marked as expired" };
		} catch (err) {
			console.error("Error marking member as expired:", err);
			return fail(500, { success: false, message: "Failed to mark member as expired" });
		}
	},

	cancel: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const memberId = formData.get("memberId");

		if (!memberId || typeof memberId !== "string") {
			return fail(400, { success: false, message: "Member ID is required" });
		}

		try {
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, memberId),
			});

			if (!member) {
				return fail(404, { success: false, message: "Member not found" });
			}

			await db.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, memberId));

			await auditMemberAction(event, "member.cancel", memberId, {
				previousStatus: member.status,
			});

			return { success: true, message: "Membership cancelled successfully" };
		} catch (err) {
			console.error("Error cancelling membership:", err);
			return fail(500, { success: false, message: "Failed to cancel membership" });
		}
	},

	reactivate: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const memberId = formData.get("memberId");

		if (!memberId || typeof memberId !== "string") {
			return fail(400, { success: false, message: "Member ID is required" });
		}

		try {
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, memberId),
			});

			if (!member) {
				return fail(404, { success: false, message: "Member not found" });
			}

			if (member.status !== "expired" && member.status !== "cancelled") {
				return fail(400, {
					success: false,
					message: "Only expired or cancelled memberships can be reactivated",
				});
			}

			await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

			await auditMemberAction(event, "member.reactivate", memberId, {
				previousStatus: member.status,
			});

			return { success: true, message: "Membership reactivated successfully" };
		} catch (err) {
			console.error("Error reactivating membership:", err);
			return fail(500, { success: false, message: "Failed to reactivate membership" });
		}
	},
};
