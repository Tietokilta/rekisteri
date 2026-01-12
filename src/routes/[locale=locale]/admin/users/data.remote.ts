import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import * as z from "zod";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { auditLog } from "$lib/server/db/schema";
import { isNonEmpty } from "$lib/utils";

export const promoteToAdminSchema = z.object({
	userId: z.string().min(1),
});

export const promoteToAdmin = form(promoteToAdminSchema, async ({ userId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const user = await db.query.user.findFirst({
		where: eq(table.user.id, userId),
	});

	if (!user) {
		error(404, "User not found");
	}

	if (user.isAdmin) {
		error(400, "User is already an admin");
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
});

export const demoteFromAdminSchema = z.object({
	userId: z.string().min(1),
});

export const demoteFromAdmin = form(demoteFromAdminSchema, async ({ userId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const user = await db.query.user.findFirst({
		where: eq(table.user.id, userId),
	});

	if (!user) {
		error(404, "User not found");
	}

	if (!user.isAdmin) {
		error(400, "User is not an admin");
	}

	// Prevent demoting yourself
	if (user.id === event.locals.user.id) {
		error(400, "You cannot demote yourself");
	}

	// Count total admins to prevent removing the last one
	const adminCount = await db
		.select({ count: sql<number>`count(*)` })
		.from(table.user)
		.where(eq(table.user.isAdmin, true));

	if (!isNonEmpty(adminCount) || adminCount[0].count <= 1) {
		error(400, "Cannot demote the last admin");
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
});
