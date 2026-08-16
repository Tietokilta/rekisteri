import { error } from "@sveltejs/kit";
import { command, form, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { inArray, sql } from "drizzle-orm";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import { generateUserId } from "$lib/server/auth/utils";
import { getUsersByEmails } from "$lib/server/auth/secondary-email";
import { getLL } from "$lib/server/i18n";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import { auditFromEvent } from "$lib/server/audit";
import { normalizeEmail } from "$lib/utils";
import {
  createLegacyMembershipSchema,
  createLegacyMembershipsBatchSchema,
  csvRowSchema,
  importMembersSchema,
  type CsvRow,
} from "./schema";

type ImportError = { row: number; email: string; error: string };
type FeePeriod = typeof table.membershipFeePeriod.$inferSelect & {
  membershipType: typeof table.membershipType.$inferSelect;
};
type PreparedRow = { row: CsvRow; rowNumber: number; period: FeePeriod };

function parseRows(rowsJson: string, invalidDataFormatMessage: string): CsvRow[] {
  let input: unknown;
  try {
    input = JSON.parse(rowsJson);
  } catch {
    error(400, invalidDataFormatMessage);
  }
  const result = v.safeParse(v.array(csvRowSchema), input);
  if (!result.success) error(400, "Invalid CSV row data");
  return result.output.map((row) => ({ ...row, email: normalizeEmail(row.email) }));
}

function dateOnly(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}

function helsinkiTimestamp(date: string) {
  return sql<Date>`${date}::date::timestamp AT TIME ZONE 'Europe/Helsinki'`;
}

function todayInHelsinki() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nextNonPaymentAction(endDate: string) {
  return `${endDate.slice(0, 4)}-12-01`;
}

function areConsecutive(previous: FeePeriod, next: FeePeriod) {
  const dayAfterPrevious = new Date(`${previous.endDate}T00:00:00Z`);
  dayAfterPrevious.setUTCDate(dayAfterPrevious.getUTCDate() + 1);
  return dayAfterPrevious.toISOString().slice(0, 10) === next.startDate;
}

function prepareRows(rows: CsvRow[], periods: FeePeriod[]) {
  const periodByTypeAndStart = new Map(
    periods.map((period) => [`${period.membershipTypeId}:${period.startDate}`, period]),
  );
  const preparedRows: PreparedRow[] = [];
  const errors: ImportError[] = [];
  const exactDateRows = new Map<string, CsvRow>();

  for (const [index, row] of rows.entries()) {
    const startDate = dateOnly(row.membershipStartDate);
    const period = startDate ? periodByTypeAndStart.get(`${row.membershipTypeId}:${startDate}`) : null;
    if (!startDate) {
      errors.push({
        row: index + 1,
        email: row.email,
        error: `Invalid membership start date: ${row.membershipStartDate}`,
      });
      continue;
    }
    if (!period) {
      errors.push({
        row: index + 1,
        email: row.email,
        error: `No fee period found for ${row.membershipTypeId} starting on ${startDate}`,
      });
      continue;
    }

    const exactDateKey = `${row.email}:${startDate}`;
    const existing = exactDateRows.get(exactDateKey);
    if (
      existing &&
      (existing.firstNames !== row.firstNames ||
        existing.lastName !== row.lastName ||
        existing.homeMunicipality !== row.homeMunicipality ||
        existing.membershipTypeId !== row.membershipTypeId)
    ) {
      errors.push({ row: index + 1, email: row.email, error: "Conflicting rows for the same member and start date" });
      continue;
    }
    exactDateRows.set(exactDateKey, row);
    preparedRows.push({ row, rowNumber: index + 1, period });
  }

  return { preparedRows, errors };
}

function latestRowsByEmail(rows: PreparedRow[]) {
  const grouped = new Map<string, PreparedRow[]>();
  for (const prepared of rows) {
    const group = grouped.get(prepared.row.email) ?? [];
    group.push(prepared);
    grouped.set(prepared.row.email, group);
  }
  for (const group of grouped.values()) {
    group.sort((left, right) => left.period.startDate.localeCompare(right.period.startDate));
  }
  return grouped;
}

function isAllowedEmail(value: string | undefined) {
  return ["true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

function finalSegmentStart(rows: PreparedRow[]) {
  let index = rows.length - 1;
  while (index > 0) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous || !current || !areConsecutive(previous.period, current.period)) break;
    index--;
  }
  const first = rows[index];
  if (!first) throw new Error("Cannot infer a membership timeline without imported rows");
  return first.period.startDate;
}

function inferredTimelineValues(memberId: string, rows: PreparedRow[]) {
  type StagedEvent = Omit<typeof table.membershipEvent.$inferInsert, "effectiveAt"> & { effectiveDate: string };
  const events: StagedEvent[] = [];
  for (const [index, prepared] of rows.entries()) {
    const previous = rows[index - 1];
    const startsSegment = !previous || !areConsecutive(previous.period, prepared.period);
    if (startsSegment) {
      if (previous) {
        const endedOn = nextNonPaymentAction(previous.period.endDate);
        events.push({
          id: crypto.randomUUID(),
          memberId,
          eventType: "legacy_resignation_inferred",
          effectiveDate: endedOn,
          source: "imported",
          certainty: "inferred",
          data: { reason: "Missing imported fee period" },
        });
      }
      events.push({
        id: crypto.randomUUID(),
        memberId,
        eventType: previous ? "legacy_rejoin_inferred" : "legacy_membership_started_inferred",
        effectiveDate: prepared.period.startDate,
        source: "imported",
        certainty: "inferred",
        membershipFeePeriodId: prepared.period.id,
        data: { membershipTypeId: prepared.period.membershipTypeId },
      });
    } else if (previous.period.membershipTypeId !== prepared.period.membershipTypeId) {
      events.push({
        id: crypto.randomUUID(),
        memberId,
        eventType: "legacy_type_changed_inferred",
        effectiveDate: prepared.period.startDate,
        source: "imported",
        certainty: "inferred",
        membershipFeePeriodId: prepared.period.id,
        data: {
          fromMembershipTypeId: previous.period.membershipTypeId,
          toMembershipTypeId: prepared.period.membershipTypeId,
        },
      });
    }
  }

  const latest = rows.at(-1);
  if (!latest) throw new Error("Cannot infer a membership timeline without imported rows");
  const inferredEndDate = nextNonPaymentAction(latest.period.endDate);
  if (inferredEndDate <= todayInHelsinki()) {
    events.push({
      id: crypto.randomUUID(),
      memberId,
      eventType: "legacy_resignation_inferred",
      effectiveDate: inferredEndDate,
      source: "imported",
      certainty: "inferred",
      data: { reason: "No later imported fee period" },
    });
  }
  return events.map(({ effectiveDate, ...event }) => ({
    ...event,
    effectiveAt: helsinkiTimestamp(effectiveDate),
  }));
}

export const importMembers = form(importMembersSchema, async ({ rows: rowsJson }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);
  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  const rows = parseRows(rowsJson, LL.admin.import.invalidDataFormat());
  const periods = await db.query.membershipFeePeriod.findMany({ with: { membershipType: true } });
  const { preparedRows, errors } = prepareRows(rows, periods);
  if (errors.length > 0) return { success: false, successCount: 0, totalRows: rows.length, errors };

  const rowsByEmail = latestRowsByEmail(preparedRows);
  const existingUsers = await getUsersByEmails([...rowsByEmail.keys()]);
  let usersCreated = 0;
  let membersCreated = 0;
  let paymentsCreated = 0;

  await db.transaction(async (tx) => {
    const importsByUserId = new Map<string, PreparedRow[]>();
    const newUserValues: (typeof table.user.$inferInsert)[] = [];

    for (const [email, memberRows] of rowsByEmail) {
      const latest = memberRows.at(-1);
      if (!latest) throw new Error("Cannot import an empty member row group");
      const existingUser = existingUsers.get(email);
      const userId = existingUser?.id ?? generateUserId();
      if (!existingUser) {
        newUserValues.push({
          id: userId,
          email,
          firstNames: latest.row.firstNames,
          lastName: latest.row.lastName,
          homeMunicipality: latest.row.homeMunicipality,
          isAllowedEmails: isAllowedEmail(latest.row.isAllowedEmails),
        });
      }
      const combinedRows = [...(importsByUserId.get(userId) ?? []), ...memberRows];
      combinedRows.sort((left, right) => left.period.startDate.localeCompare(right.period.startDate));
      importsByUserId.set(userId, combinedRows);
    }

    if (newUserValues.length > 0) {
      await tx.insert(table.user).values(newUserValues);
      usersCreated = newUserValues.length;
    }

    const userIds = [...importsByUserId.keys()];
    const existingMembers =
      userIds.length === 0 ? [] : await tx.select().from(table.member).where(inArray(table.member.userId, userIds));
    const existingMembersByUserId = new Map(
      existingMembers.flatMap((member) => (member.userId ? [[member.userId, member] as const] : [])),
    );
    const existingMemberIds = existingMembers.map((member) => member.id);
    const existingPayments =
      existingMemberIds.length === 0
        ? []
        : await tx.select().from(table.payment).where(inArray(table.payment.memberId, existingMemberIds));
    const paidPeriodsByMemberId = new Map<string, Set<string>>();
    for (const payment of existingPayments) {
      if (payment.status !== "succeeded" || payment.refundConfirmedAt || payment.invalidatedAt) continue;
      const paidPeriods = paidPeriodsByMemberId.get(payment.memberId) ?? new Set<string>();
      paidPeriods.add(payment.membershipFeePeriodId);
      paidPeriodsByMemberId.set(payment.memberId, paidPeriods);
    }

    const newMemberValues: PgInsertValue<typeof table.member>[] = [];
    const timelineValues: PgInsertValue<typeof table.membershipEvent>[] = [];
    const memberIdByUserId = new Map(existingMembersByUserId.entries().map(([userId, member]) => [userId, member.id]));

    for (const [userId, memberRows] of importsByUserId) {
      if (existingMembersByUserId.has(userId)) continue;
      const latest = memberRows.at(-1);
      if (!latest) throw new Error("Cannot import an empty member row group");
      const memberId = crypto.randomUUID();
      const inferredEndDate = nextNonPaymentAction(latest.period.endDate);
      const ended = inferredEndDate <= todayInHelsinki();
      newMemberValues.push({
        id: memberId,
        userId,
        status: ended ? "ended" : "active",
        membershipTypeId: latest.period.membershipTypeId,
        currentMembershipStartedAt: helsinkiTimestamp(finalSegmentStart(memberRows)),
        currentMembershipEndedAt: ended ? helsinkiTimestamp(inferredEndDate) : null,
      });
      timelineValues.push(...inferredTimelineValues(memberId, memberRows));
      memberIdByUserId.set(userId, memberId);
    }

    if (newMemberValues.length > 0) {
      await tx.insert(table.member).values(newMemberValues);
      membersCreated = newMemberValues.length;
    }
    if (timelineValues.length > 0) {
      await tx.insert(table.membershipEvent).values(timelineValues);
    }

    const paymentValues: (typeof table.payment.$inferInsert)[] = [];
    for (const [userId, memberRows] of importsByUserId) {
      const memberId = memberIdByUserId.get(userId);
      if (!memberId) throw new Error("Imported member could not be resolved");
      const existingPaidPeriods = paidPeriodsByMemberId.get(memberId) ?? new Set<string>();
      const rowsByPeriod = new Map(memberRows.map((prepared) => [prepared.period.id, prepared]));
      for (const prepared of rowsByPeriod.values()) {
        if (!prepared.period.membershipType.requiresPayment || existingPaidPeriods.has(prepared.period.id)) continue;
        paymentValues.push({
          id: `import-payment-${memberId}-${prepared.period.id}`,
          memberId,
          membershipFeePeriodId: prepared.period.id,
          source: "imported",
          status: "succeeded",
        });
      }
    }

    if (paymentValues.length > 0) {
      const inserted = await tx
        .insert(table.payment)
        .values(paymentValues)
        .onConflictDoNothing()
        .returning({ id: table.payment.id });
      paymentsCreated = inserted.length;
    }
  });

  await auditFromEvent(event, "member.bulk_import", {
    targetType: "member",
    metadata: {
      totalRows: rows.length,
      successCount: rows.length,
      newUsersCreated: usersCreated,
      membersCreated,
      paymentsCreated,
      model: "indefinite_membership",
    },
  });
  return { success: true, successCount: rows.length, totalRows: rows.length, errors: [] as ImportError[] };
});

function historicalPeriodValues(data: { membershipTypeId: string; startTime: string; endTime: string }) {
  const startDate = dateOnly(data.startTime);
  const endDate = dateOnly(data.endTime);
  if (!startDate || !endDate) error(400, "Invalid fee-period dates");
  const year = startDate.slice(0, 4);
  return {
    id: crypto.randomUUID(),
    membershipTypeId: data.membershipTypeId,
    stripePriceId: null,
    startDate,
    endDate,
    dueDate: `${year}-09-30`,
    nonPaymentActionAt: `${year}-12-01`,
  };
}

export const createLegacyMembership = command(createLegacyMembershipSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);
  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }
  const [period] = await db
    .insert(table.membershipFeePeriod)
    .values(historicalPeriodValues(data))
    .onConflictDoNothing({ target: [table.membershipFeePeriod.membershipTypeId, table.membershipFeePeriod.startDate] })
    .returning();
  if (period) {
    await auditFromEvent(event, "membership.create", {
      targetType: "membership",
      targetId: period.id,
      metadata: { membershipTypeId: data.membershipTypeId, startDate: data.startTime, historical: true },
    });
  }
  return { success: true, membership: period ?? null };
});

export const createLegacyMemberships = command(createLegacyMembershipsBatchSchema, async ({ memberships }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);
  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }
  const created = await db
    .insert(table.membershipFeePeriod)
    .values(memberships.map(historicalPeriodValues))
    .onConflictDoNothing({ target: [table.membershipFeePeriod.membershipTypeId, table.membershipFeePeriod.startDate] })
    .returning();
  if (created.length > 0) {
    await auditFromEvent(event, "membership.create", {
      targetType: "membership",
      metadata: { count: created.length, historical: true, batch: true },
    });
  }
  return { success: true, count: created.length };
});
