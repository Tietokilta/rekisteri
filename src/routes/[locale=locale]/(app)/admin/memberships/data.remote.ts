import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, eq } from "drizzle-orm";
import { createMembershipSchema, deleteMembershipSchema, updateMembershipSchema } from "./schema";
import { hasAdminWriteAccess } from "$lib/server/auth/admin";

export const createMembership = form(createMembershipSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.session || !hasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  // For non-purchasable types, ignore stripePriceId and requiresStudentVerification
  const membershipType = await db._query.membershipType.findFirst({
    where: eq(table.membershipType.id, data.membershipTypeId),
  });
  if (!membershipType) {
    error(400, "Membership type not found");
  }
  const stripePriceId = membershipType.purchasable ? (data.stripePriceId ?? null) : null;
  const requiresStudentVerification = membershipType.purchasable ? data.requiresStudentVerification : false;

  await db
    .insert(table.membership)
    .values({
      id: crypto.randomUUID(),
      membershipTypeId: data.membershipTypeId,
      stripePriceId,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      requiresStudentVerification,
    })
    .execute();

  return { success: true };
});

export const deleteMembership = form(deleteMembershipSchema, async ({ id }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !hasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  const memberCount = await db
    .select({ count: count() })
    .from(table.member)
    .where(eq(table.member.membershipId, id))
    .then((result) => result[0]?.count ?? 0);

  if (memberCount > 0) {
    error(400, "Cannot delete membership with active members");
  }

  await db.delete(table.membership).where(eq(table.membership.id, id)).execute();

  return { success: true };
});

export const updateMembership = form(updateMembershipSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.session || !hasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  // Verify membership exists before updating
  const existing = await db
    .select({ id: table.membership.id })
    .from(table.membership)
    .where(eq(table.membership.id, data.id))
    .then((result) => result[0]);

  if (!existing) {
    error(404, "Membership not found");
  }

  // For non-purchasable types, ignore stripePriceId and requiresStudentVerification
  const membershipType = await db._query.membershipType.findFirst({
    where: eq(table.membershipType.id, data.membershipTypeId),
  });
  if (!membershipType) {
    error(400, "Membership type not found");
  }
  const stripePriceId = membershipType.purchasable ? (data.stripePriceId ?? null) : null;
  const requiresStudentVerification = membershipType.purchasable ? data.requiresStudentVerification : false;

  await db
    .update(table.membership)
    .set({
      membershipTypeId: data.membershipTypeId,
      stripePriceId,
      requiresStudentVerification,
    })
    .where(eq(table.membership.id, data.id))
    .execute();

  return { success: true };
});
