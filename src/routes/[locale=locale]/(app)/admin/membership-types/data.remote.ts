import { error } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, eq } from "drizzle-orm";
import { createMembershipTypeSchema, deleteMembershipTypeSchema, updateMembershipTypeSchema } from "./schema";
import { getLL } from "$lib/server/i18n";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import { auditFromEvent } from "$lib/server/audit";

export const createMembershipType = form(createMembershipTypeSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // Check if ID already exists
  const [existing] = await db
    .select({ id: table.membershipType.id })
    .from(table.membershipType)
    .where(eq(table.membershipType.id, data.id));

  if (existing) {
    error(400, LL.admin.membershipTypes.idAlreadyExists());
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
      purchasable: data.purchasable,
      requiresPayment: data.requiresPayment,
      requiresStudentVerification: data.requiresStudentVerification,
    })
    .execute();

  await auditFromEvent(event, "membership_type.create", {
    targetType: "membership_type",
    targetId: data.id,
    metadata: {
      nameFi: data.nameFi,
      nameEn: data.nameEn,
      purchasable: data.purchasable,
      requiresPayment: data.requiresPayment,
      requiresStudentVerification: data.requiresStudentVerification,
    },
  });

  return { success: true };
});

export const updateMembershipType = form(updateMembershipTypeSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // Verify membership type exists before updating
  const [existing] = await db.select().from(table.membershipType).where(eq(table.membershipType.id, data.id));

  if (!existing) {
    error(404, LL.admin.membershipTypes.membershipTypeNotFound());
  }

  if (existing.requiresPayment !== data.requiresPayment) {
    const publishedPeriod = await db.query.membershipFeePeriod.findFirst({
      where: { membershipTypeId: data.id, publishedAt: { isNotNull: true } },
      columns: { id: true },
    });
    if (publishedPeriod) error(400, "Payment requirements cannot change after a fee period is published");
  }

  await db
    .update(table.membershipType)
    .set({
      name: { fi: data.nameFi, en: data.nameEn },
      description:
        data.descriptionFi || data.descriptionEn
          ? { fi: data.descriptionFi ?? "", en: data.descriptionEn ?? "" }
          : null,
      purchasable: data.purchasable,
      requiresPayment: data.requiresPayment,
      requiresStudentVerification: data.requiresStudentVerification,
    })
    .where(eq(table.membershipType.id, data.id))
    .execute();

  await auditFromEvent(event, "membership_type.update", {
    targetType: "membership_type",
    targetId: data.id,
    metadata: {
      nameFi: data.nameFi,
      nameEn: data.nameEn,
      purchasable: data.purchasable,
      requiresPayment: data.requiresPayment,
      requiresStudentVerification: data.requiresStudentVerification,
    },
  });

  return { success: true };
});

export const deleteMembershipType = form(deleteMembershipTypeSchema, async ({ id }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // Check if any memberships use this type
  const [membershipCountResult] = await db
    .select({ count: count() })
    .from(table.membershipFeePeriod)
    .where(eq(table.membershipFeePeriod.membershipTypeId, id));
  const membershipCount = membershipCountResult?.count ?? 0;

  if (membershipCount > 0) {
    error(400, LL.admin.membershipTypes.cannotDeleteInUse());
  }

  await db.delete(table.membershipType).where(eq(table.membershipType.id, id)).execute();

  await auditFromEvent(event, "membership_type.delete", {
    targetType: "membership_type",
    targetId: id,
  });

  return { success: true };
});
