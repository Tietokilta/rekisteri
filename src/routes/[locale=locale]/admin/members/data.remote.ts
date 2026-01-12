import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import * as z from "zod";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { auditMemberAction } from "$lib/server/audit";

export const memberIdSchema = z.object({
	memberId: z.string().min(1),
});

export const approveMember = form(memberIdSchema, async ({ memberId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const member = await db.query.member.findFirst({
		where: eq(table.member.id, memberId),
	});

	if (!member) {
		error(404, "Member not found");
	}

	if (member.status !== "awaiting_approval") {
		error(400, "Member is not awaiting approval");
	}

	await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

	await auditMemberAction(event, "member.approve", memberId, {
		previousStatus: member.status,
	});

	return { success: true, message: "Member approved successfully" };
});

export const rejectMember = form(memberIdSchema, async ({ memberId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const member = await db.query.member.findFirst({
		where: eq(table.member.id, memberId),
	});

	if (!member) {
		error(404, "Member not found");
	}

	await db.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, memberId));

	await auditMemberAction(event, "member.reject", memberId, {
		previousStatus: member.status,
	});

	return { success: true, message: "Member rejected successfully" };
});

export const markMemberExpired = form(memberIdSchema, async ({ memberId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const member = await db.query.member.findFirst({
		where: eq(table.member.id, memberId),
	});

	if (!member) {
		error(404, "Member not found");
	}

	await db.update(table.member).set({ status: "expired" }).where(eq(table.member.id, memberId));

	await auditMemberAction(event, "member.expire", memberId, {
		previousStatus: member.status,
	});

	return { success: true, message: "Member marked as expired" };
});

export const cancelMember = form(memberIdSchema, async ({ memberId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const member = await db.query.member.findFirst({
		where: eq(table.member.id, memberId),
	});

	if (!member) {
		error(404, "Member not found");
	}

	await db.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, memberId));

	await auditMemberAction(event, "member.cancel", memberId, {
		previousStatus: member.status,
	});

	return { success: true, message: "Membership cancelled successfully" };
});

export const reactivateMember = form(memberIdSchema, async ({ memberId }) => {
	const event = getRequestEvent();

	if (!event.locals.session || !event.locals.user?.isAdmin) {
		error(404, "Not found");
	}

	const member = await db.query.member.findFirst({
		where: eq(table.member.id, memberId),
	});

	if (!member) {
		error(404, "Member not found");
	}

	if (member.status !== "expired" && member.status !== "cancelled") {
		error(400, "Only expired or cancelled memberships can be reactivated");
	}

	await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

	await auditMemberAction(event, "member.reactivate", memberId, {
		previousStatus: member.status,
	});

	return { success: true, message: "Membership reactivated successfully" };
});
