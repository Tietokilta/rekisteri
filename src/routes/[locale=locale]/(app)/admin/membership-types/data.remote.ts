import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, eq } from "drizzle-orm";
import { createMembershipTypeSchema, deleteMembershipTypeSchema, updateMembershipTypeSchema } from "./schema";

export const createMembershipType = form(createMembershipTypeSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Check if ID already exists
  const existing = await db
    .select({ id: table.membershipType.id })
    .from(table.membershipType)
    .where(eq(table.membershipType.id, data.id))
    .then((result) => result[0]);

  if (existing) {
    error(400, "A membership type with this ID already exists");
  }

  await db
    .insert(table.membershipType)
    .values({
      id: data.id,
      name: { fi: data.nameFi, en: data.nameEn },
      description:
        data.descriptionFi || data.descriptionEn
          ? { fi: data.descriptionFi ?? "", en: data.descriptionEn ?? "" }
          : null,
    })
    .execute();

  return { success: true };
});

export const updateMembershipType = form(updateMembershipTypeSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Verify membership type exists before updating
  const existing = await db
    .select({ id: table.membershipType.id })
    .from(table.membershipType)
    .where(eq(table.membershipType.id, data.id))
    .then((result) => result[0]);

  if (!existing) {
    error(404, "Membership type not found");
  }

  await db
    .update(table.membershipType)
    .set({
      name: { fi: data.nameFi, en: data.nameEn },
      description:
        data.descriptionFi || data.descriptionEn
          ? { fi: data.descriptionFi ?? "", en: data.descriptionEn ?? "" }
          : null,
    })
    .where(eq(table.membershipType.id, data.id))
    .execute();

  return { success: true };
});

export const deleteMembershipType = form(deleteMembershipTypeSchema, async ({ id }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
  }

  // Check if any memberships use this type
  const membershipCount = await db
    .select({ count: count() })
    .from(table.membership)
    .where(eq(table.membership.membershipTypeId, id))
    .then((result) => result[0]?.count ?? 0);

  if (membershipCount > 0) {
    error(400, "Cannot delete membership type that is used by existing memberships");
  }

  await db.delete(table.membershipType).where(eq(table.membershipType.id, id)).execute();

  return { success: true };
});
