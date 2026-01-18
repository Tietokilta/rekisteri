import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { verifyQrToken } from "$lib/server/attendance/qr-token";
import { scanQrSchema } from "./schema";

/**
 * Scans a member QR code for check-in or check-out.
 *
 * Double-scan prevention:
 * - If last event was CHECK_IN, this will CHECK_OUT
 * - If last event was CHECK_OUT (or no events), this will CHECK_IN
 *
 * Only accessible to admin users during ongoing meetings or recess.
 */
export const scanQr = form(scanQrSchema, async (data) => {
	const event = getRequestEvent();

	if (!event.locals.user?.isAdmin) {
		error(403, "Forbidden");
	}

	// Verify meeting exists and is in correct state
	const meeting = await db.query.meeting.findFirst({
		where: eq(table.meeting.id, data.meetingId),
	});

	if (!meeting) {
		error(404, "Meeting not found");
	}

	if (meeting.status !== "ongoing" && meeting.status !== "recess") {
		error(400, `Cannot scan when meeting is ${meeting.status}`);
	}

	// Verify QR token and get user ID
	const userId = await verifyQrToken(data.token);

	if (!userId) {
		return {
			success: false,
			error: "invalid_token",
			message: "Invalid or expired QR code",
		};
	}

	// Get user details for display
	const user = await db.query.user.findFirst({
		where: eq(table.user.id, userId),
		columns: {
			id: true,
			email: true,
			firstNames: true,
			lastName: true,
		},
	});

	if (!user) {
		error(500, "User not found");
	}

	// Check if user has valid membership
	const validMember = await db.query.member.findFirst({
		where: and(
			eq(table.member.userId, userId),
			eq(table.member.status, "active"), // Only active members can attend
		),
	});

	if (!validMember) {
		return {
			success: false,
			error: "no_membership",
			message: "User does not have an active membership",
			user: {
				email: user.email,
				name: user.firstNames && user.lastName ? `${user.firstNames} ${user.lastName}` : user.email,
			},
		};
	}

	// Get last attendance event for this user at this meeting
	const lastEvent = await db.query.attendance.findFirst({
		where: and(eq(table.attendance.meetingId, data.meetingId), eq(table.attendance.userId, userId)),
		orderBy: [desc(table.attendance.timestamp)],
	});

	// Determine event type (toggle between CHECK_IN and CHECK_OUT)
	const eventType = lastEvent?.eventType === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN";

	// Record attendance event
	await db.insert(table.attendance).values({
		id: crypto.randomUUID(),
		meetingId: data.meetingId,
		userId,
		eventType,
		scanMethod: "qr_scan",
		scannedBy: event.locals.user.id,
		timestamp: new Date(),
	});

	return {
		success: true,
		eventType,
		user: {
			id: user.id,
			email: user.email,
			name: user.firstNames && user.lastName ? `${user.firstNames} ${user.lastName}` : user.email,
		},
	};
});
