import { error } from "@sveltejs/kit";
import { form, getRequestEvent, command } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auditMemberAction, auditBulkMemberAction } from "$lib/server/audit";
import { memberIdSchema, bulkMemberIdsSchema } from "./schema";

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

// Bulk actions
export const bulkApproveMembers = command(bulkMemberIdsSchema, async ({ memberIds }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Fetch all members to validate they exist and are awaiting approval
  const members = await db.query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  const validMembers = members.filter((m) => m.status === "awaiting_approval");

  if (validMembers.length === 0) {
    error(400, "No members are awaiting approval");
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "active" }).where(inArray(table.member.id, validIds));
  });

  await auditBulkMemberAction(event, "member.bulk_approve", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  return {
    success: true,
    message: `${validIds.length} member(s) approved successfully`,
    processedCount: validIds.length,
  };
});

export const bulkRejectMembers = command(bulkMemberIdsSchema, async ({ memberIds }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Fetch all members to validate they exist and are awaiting approval
  const members = await db.query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  const validMembers = members.filter((m) => m.status === "awaiting_approval");

  if (validMembers.length === 0) {
    error(400, "No members are awaiting approval");
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "cancelled" }).where(inArray(table.member.id, validIds));
  });

  await auditBulkMemberAction(event, "member.bulk_reject", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  return {
    success: true,
    message: `${validIds.length} member(s) rejected successfully`,
    processedCount: validIds.length,
  };
});

export const bulkMarkMembersExpired = command(bulkMemberIdsSchema, async ({ memberIds }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Fetch all members to validate they exist and can be marked expired
  const members = await db.query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  const validMembers = members.filter((m) => m.status === "active" || m.status === "awaiting_payment");

  if (validMembers.length === 0) {
    error(400, "No members can be marked as expired");
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "expired" }).where(inArray(table.member.id, validIds));
  });

  await auditBulkMemberAction(event, "member.bulk_expire", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  return {
    success: true,
    message: `${validIds.length} member(s) marked as expired`,
    processedCount: validIds.length,
  };
});

export const bulkCancelMembers = command(bulkMemberIdsSchema, async ({ memberIds }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Fetch all members to validate they exist and can be cancelled
  const members = await db.query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  const validMembers = members.filter((m) => m.status === "active" || m.status === "awaiting_payment");

  if (validMembers.length === 0) {
    error(400, "No members can be cancelled");
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "cancelled" }).where(inArray(table.member.id, validIds));
  });

  await auditBulkMemberAction(event, "member.bulk_cancel", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  return {
    success: true,
    message: `${validIds.length} membership(s) cancelled`,
    processedCount: validIds.length,
  };
});

export const bulkReactivateMembers = command(bulkMemberIdsSchema, async ({ memberIds }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Fetch all members to validate they exist and can be reactivated
  const members = await db.query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  const validMembers = members.filter((m) => m.status === "expired" || m.status === "cancelled");

  if (validMembers.length === 0) {
    error(400, "No members can be reactivated");
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "active" }).where(inArray(table.member.id, validIds));
  });

  await auditBulkMemberAction(event, "member.bulk_reactivate", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  return {
    success: true,
    message: `${validIds.length} membership(s) reactivated`,
    processedCount: validIds.length,
  };
});
