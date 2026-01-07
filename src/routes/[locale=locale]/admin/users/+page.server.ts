import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { asc, desc, eq, max, sql } from "drizzle-orm";
import { auditLog } from "$lib/server/db/schema";
import { isNonEmpty } from "$lib/utils";

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

export const actions: Actions = {
	promoteToAdmin: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const userId = formData.get("userId");

		if (!userId || typeof userId !== "string") {
			return fail(400, { success: false, message: "User ID is required" });
		}

		try {
			const user = await db.query.user.findFirst({
				where: eq(table.user.id, userId),
			});

			if (!user) {
				return fail(404, { success: false, message: "User not found" });
			}

			if (user.isAdmin) {
				return fail(400, {
					success: false,
					message: "User is already an admin",
				});
			}

			await db.update(table.user).set({ isAdmin: true }).where(eq(table.user.id, userId));

			// Log the action
			await db.insert(auditLog).values({
				id: crypto.randomUUID(),
				userId: event.locals.user.id,
				action: "user.promote_to_admin",
				targetType: "user",
				targetId: userId,
				metadata: {
					promotedUserEmail: user.email,
				},
				ipAddress: event.getClientAddress(),
				userAgent: event.request.headers.get("user-agent") ?? undefined,
			});

			return { success: true, message: "User promoted to admin successfully" };
		} catch (err) {
			console.error("Error promoting user to admin:", err);
			return fail(500, { success: false, message: "Failed to promote user to admin" });
		}
	},

	demoteFromAdmin: async (event) => {
		if (!event.locals.session || !event.locals.user?.isAdmin) {
			return error(404, "Not found");
		}

		const formData = await event.request.formData();
		const userId = formData.get("userId");

		if (!userId || typeof userId !== "string") {
			return fail(400, { success: false, message: "User ID is required" });
		}

		try {
			const user = await db.query.user.findFirst({
				where: eq(table.user.id, userId),
			});

			if (!user) {
				return fail(404, { success: false, message: "User not found" });
			}

			if (!user.isAdmin) {
				return fail(400, {
					success: false,
					message: "User is not an admin",
				});
			}

			// Prevent demoting yourself
			if (user.id === event.locals.user.id) {
				return fail(400, {
					success: false,
					message: "You cannot demote yourself",
				});
			}

			// Count total admins to prevent removing the last one
			const adminCount = await db
				.select({ count: sql<number>`count(*)` })
				.from(table.user)
				.where(eq(table.user.isAdmin, true));

			if (!isNonEmpty(adminCount) || adminCount[0].count <= 1) {
				return fail(400, {
					success: false,
					message: "Cannot demote the last admin",
				});
			}

			await db.update(table.user).set({ isAdmin: false }).where(eq(table.user.id, userId));

			// Log the action
			await db.insert(auditLog).values({
				id: crypto.randomUUID(),
				userId: event.locals.user.id,
				action: "user.demote_from_admin",
				targetType: "user",
				targetId: userId,
				metadata: {
					demotedUserEmail: user.email,
				},
				ipAddress: event.getClientAddress(),
				userAgent: event.request.headers.get("user-agent") ?? undefined,
			});

			return { success: true, message: "User demoted from admin successfully" };
		} catch (err) {
			console.error("Error demoting user from admin:", err);
			return fail(500, { success: false, message: "Failed to demote user from admin" });
		}
	},
};
