import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import * as z from "zod";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { generateUserId } from "$lib/server/auth/utils";
import { isNonEmpty } from "$lib/utils";
import { csvRowSchema, importMembersSchema, type CsvRow } from "./schema";

export const importMembers = form(importMembersSchema, async ({ rows: rowsJson }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	let rows: CsvRow[];
	try {
		rows = JSON.parse(rowsJson);
	} catch {
		error(400, "Invalid data format");
	}

	const rowsValidation = z.array(csvRowSchema).safeParse(rows);
	if (!rowsValidation.success) {
		error(400, "Validation failed");
	}

	// Fetch all memberships
	const memberships = await db
		.select({
			id: table.membership.id,
			type: table.membership.type,
			startTime: table.membership.startTime,
			endTime: table.membership.endTime,
		})
		.from(table.membership);

	const membershipsByType = new Map<string, typeof memberships>();
	for (const membership of memberships) {
		const existing = membershipsByType.get(membership.type);
		if (existing) {
			existing.push(membership);
		} else {
			membershipsByType.set(membership.type, [membership]);
		}
	}

	const errors: Array<{ row: number; email: string; error: string }> = [];
	let successCount = 0;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (!row) continue;
		try {
			// Parse the membership start date
			const membershipStartDate = new Date(row.membershipStartDate);
			if (Number.isNaN(membershipStartDate.getTime())) {
				errors.push({
					row: i + 1,
					email: row.email,
					error: `Invalid membership start date "${row.membershipStartDate}"`,
				});
				continue;
			}

			// Check if membership type exists
			const membershipOptions = membershipsByType.get(row.membershipType);
			if (!membershipOptions || membershipOptions.length === 0) {
				errors.push({
					row: i + 1,
					email: row.email,
					error: `Membership type "${row.membershipType}" not found`,
				});
				continue;
			}

			// Find membership matching both type and start date
			const targetMembership = membershipOptions.find((m) => m.startTime.getTime() === membershipStartDate.getTime());

			if (!targetMembership) {
				errors.push({
					row: i + 1,
					email: row.email,
					error: `No membership found for type "${row.membershipType}" starting on ${row.membershipStartDate}`,
				});
				continue;
			}

			// Upsert user
			const existingUser = await db.select().from(table.user).where(eq(table.user.email, row.email)).limit(1);

			let userId: string;

			if (isNonEmpty(existingUser)) {
				// Update existing user
				userId = existingUser[0].id;
				await db
					.update(table.user)
					.set({
						firstNames: row.firstNames,
						lastName: row.lastName,
						homeMunicipality: row.homeMunicipality,
					})
					.where(eq(table.user.id, userId));
			} else {
				// Create new user
				userId = generateUserId();
				await db.insert(table.user).values({
					id: userId,
					email: row.email,
					firstNames: row.firstNames,
					lastName: row.lastName,
					homeMunicipality: row.homeMunicipality,
					isAdmin: false,
					isAllowedEmails: false,
				});
			}

			// Check if member record already exists for this membership
			const existingMember = await db
				.select()
				.from(table.member)
				.where(and(eq(table.member.userId, userId), eq(table.member.membershipId, targetMembership.id)))
				.limit(1);

			if (existingMember.length === 0) {
				// Determine status based on membership end date
				const now = new Date();
				const status = targetMembership.endTime < now ? "expired" : "active";

				// Create member record
				await db.insert(table.member).values({
					id: crypto.randomUUID(),
					userId,
					membershipId: targetMembership.id,
					status,
				});
			}

			successCount++;
		} catch (err) {
			errors.push({
				row: i + 1,
				email: row.email,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}

	return {
		success: true,
		successCount,
		totalRows: rows.length,
		errors,
	};
});
