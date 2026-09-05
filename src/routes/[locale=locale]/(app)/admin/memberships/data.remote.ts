import { error } from "@sveltejs/kit";
import { command, form, getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  createMembershipSchema,
  deleteMembershipSchema,
  membershipFeePeriodIdSchema,
  updateMembershipSchema,
} from "./schema";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import { auditFromEvent } from "$lib/server/audit";
import { stripe } from "$lib/server/payment";

function todayInHelsinki() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export const createMembership = form(createMembershipSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  const membershipType = await db.query.membershipType.findFirst({
    where: { id: data.membershipTypeId },
  });
  if (!membershipType) {
    error(400, "Membership type not found");
  }
  const stripePriceId = membershipType.requiresPayment ? (data.stripePriceId ?? null) : null;
  const startDate = data.startTime.slice(0, 10);
  const endDate = data.endTime.slice(0, 10);
  const periodYear = startDate.slice(0, 4);

  const feePeriodId = crypto.randomUUID();

  await db.insert(table.membershipFeePeriod).values({
    id: feePeriodId,
    membershipTypeId: data.membershipTypeId,
    stripePriceId,
    startDate,
    endDate,
    dueDate: `${periodYear}-09-30`,
    nonPaymentActionAt: `${periodYear}-12-01`,
  });

  await auditFromEvent(event, "membership.create", {
    targetType: "membership",
    targetId: feePeriodId,
    metadata: { membershipTypeId: data.membershipTypeId, startDate, endDate, stripePriceId, published: false },
  });

  return { success: true };
});

export const deleteMembership = form(deleteMembershipSchema, async ({ id }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  const [referenceCountResult] = await db
    .select({ count: count() })
    .from(table.membershipObligation)
    .where(eq(table.membershipObligation.membershipFeePeriodId, id));
  const referenceCount = referenceCountResult?.count ?? 0;

  if (referenceCount > 0) {
    error(400, "Cannot delete a fee period with issued obligations");
  }
  const existing = await db.query.membershipFeePeriod.findFirst({ where: { id } });
  if (existing?.publishedAt) error(400, "Published fee periods cannot be deleted");

  await db.delete(table.membershipFeePeriod).where(eq(table.membershipFeePeriod.id, id)).execute();

  await auditFromEvent(event, "membership.delete", {
    targetType: "membership",
    targetId: id,
  });

  return { success: true };
});

export const updateMembership = form(updateMembershipSchema, async (data) => {
  const event = getRequestEvent();

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  // Verify membership exists before updating
  const [existing] = await db.select().from(table.membershipFeePeriod).where(eq(table.membershipFeePeriod.id, data.id));

  if (!existing) {
    error(404, "Membership not found");
  }

  const membershipType = await db.query.membershipType.findFirst({
    where: { id: data.membershipTypeId },
  });
  if (!membershipType) {
    error(400, "Membership type not found");
  }
  const stripePriceId = membershipType.requiresPayment ? (data.stripePriceId ?? null) : null;
  const startDate = data.startTime.slice(0, 10);
  const endDate = data.endTime.slice(0, 10);
  const periodYear = startDate.slice(0, 4);
  if (
    existing.publishedAt &&
    (existing.membershipTypeId !== data.membershipTypeId ||
      existing.stripePriceId !== stripePriceId ||
      existing.startDate !== startDate ||
      existing.endDate !== endDate)
  ) {
    error(400, "Published fee-period configuration cannot be changed");
  }
  if (!existing.publishedAt) {
    await db
      .update(table.membershipFeePeriod)
      .set({
        membershipTypeId: data.membershipTypeId,
        stripePriceId,
        startDate,
        endDate,
        dueDate: `${periodYear}-09-30`,
        nonPaymentActionAt: `${periodYear}-12-01`,
      })
      .where(eq(table.membershipFeePeriod.id, data.id));
  }

  await auditFromEvent(event, "membership.update", {
    targetType: "membership",
    targetId: data.id,
    metadata: { membershipTypeId: data.membershipTypeId, stripePriceId, startDate, endDate },
  });

  return { success: true };
});

export const publishMembershipFeePeriod = command(membershipFeePeriodIdSchema, async ({ id }) => {
  const event = getRequestEvent();
  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }

  const period = await db.query.membershipFeePeriod.findFirst({ where: { id }, with: { membershipType: true } });
  if (!period) error(404, "Fee period not found");
  if (period.publishedAt) return { success: true };

  if (period.membershipType.requiresPayment) {
    if (!period.stripePriceId) error(400, "A paid membership fee period requires a Stripe price");
    const price = await stripe.prices.retrieve(period.stripePriceId);
    if (price.unit_amount === null) error(400, "Stripe price must have a fixed amount");
    if (!price.active) error(400, "Stripe price must be active");
  } else if (period.stripePriceId) {
    error(400, "A free membership type cannot publish a Stripe price");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "membership_fee_period" WHERE "id" = ${id} FOR UPDATE`);
    const current = await tx.query.membershipFeePeriod.findFirst({ where: { id } });
    if (!current || current.publishedAt) return;
    if (
      current.membershipTypeId !== period.membershipTypeId ||
      current.stripePriceId !== period.stripePriceId ||
      current.startDate !== period.startDate ||
      current.endDate !== period.endDate
    ) {
      throw new Error("Fee period changed while its publication was being validated");
    }

    if (period.membershipType.requiresPayment) {
      const activeMembers = await tx.query.member.findMany({
        where: { status: "active", membershipTypeId: period.membershipTypeId },
        columns: { id: true },
      });
      if (activeMembers.length > 0) {
        await tx
          .insert(table.membershipObligation)
          .values(
            activeMembers.map((member) => ({
              id: crypto.randomUUID(),
              memberId: member.id,
              membershipFeePeriodId: id,
              kind: "renewal" as const,
            })),
          )
          .onConflictDoNothing();
      }
    }
    await tx
      .update(table.membershipFeePeriod)
      .set({ publishedAt: new Date() })
      .where(and(eq(table.membershipFeePeriod.id, id), isNull(table.membershipFeePeriod.publishedAt)));
  });

  await auditFromEvent(event, "membership.publish", {
    targetType: "membership",
    targetId: id,
    metadata: { membershipTypeId: period.membershipTypeId },
  });
  return { success: true };
});

export const selectApplicationTarget = command(membershipFeePeriodIdSchema, async ({ id }) => {
  const event = getRequestEvent();
  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, "Not found");
  }
  const period = await db.query.membershipFeePeriod.findFirst({ where: { id }, with: { membershipType: true } });
  if (!period?.publishedAt) error(400, "Only a published fee period can accept applications");
  if (period.endDate < todayInHelsinki()) error(400, "An expired period cannot accept applications");
  if (period.membershipType.requiresPayment && !period.stripePriceId) {
    error(400, "A paid application target requires a Stripe price");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(table.membershipFeePeriod)
      .set({ acceptsApplications: false })
      .where(eq(table.membershipFeePeriod.membershipTypeId, period.membershipTypeId));
    await tx
      .update(table.membershipFeePeriod)
      .set({ acceptsApplications: true })
      .where(
        and(
          eq(table.membershipFeePeriod.id, id),
          eq(table.membershipFeePeriod.membershipTypeId, period.membershipTypeId),
        ),
      );
  });
  await auditFromEvent(event, "membership.application_target_select", {
    targetType: "membership",
    targetId: id,
    metadata: { membershipTypeId: period.membershipTypeId },
  });
  return { success: true };
});
