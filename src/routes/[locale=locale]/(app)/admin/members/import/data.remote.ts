import { error } from "@sveltejs/kit";
import { form, command, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { generateUserId } from "$lib/server/auth/utils";
import { getUsersByEmails } from "$lib/server/auth/secondary-email";
import {
  csvRowSchema,
  importMembersSchema,
  createLegacyMembershipSchema,
  createLegacyMembershipsBatchSchema,
  type CsvRow,
} from "./schema";
import { getLL } from "$lib/server/i18n";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import { normalizeEmail } from "$lib/utils";
import { auditFromEvent } from "$lib/server/audit";

const IMPORT_BATCH_SIZE = 500;

type ImportError = { row: number; email: string; error: string };

type ImportMembership = {
  id: string;
  membershipTypeId: string;
  startTime: Date;
  endTime: Date;
};

type ProcessedImportRow = {
  index: number;
  row: CsvRow;
  userId: string;
  membershipId: string;
  status: "active" | "resigned";
  isNewUser: boolean;
};

type RowReference = {
  row: CsvRow;
  originalIndex: number;
};

type MembershipLookup = {
  validTypeIds: Set<string>;
  membershipsByTypeId: Map<string, ImportMembership[]>;
};

function parseImportRows(rowsJson: string, invalidDataFormatMessage: string): CsvRow[] {
  let rows: unknown;
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    error(400, invalidDataFormatMessage);
  }

  const validation = v.safeParse(v.array(csvRowSchema), rows);
  if (!validation.success) {
    const issues = validation.issues
      .slice(0, 5)
      .map((issue) => {
        const path = issue.path?.map((p) => p.key).join(".") || "unknown";
        return `Row ${path}: ${issue.message}`;
      })
      .join("; ");
    error(400, `Validation failed: ${issues}`);
  }

  return validation.output;
}

function groupMembershipsByTypeId(memberships: ImportMembership[]): Map<string, ImportMembership[]> {
  const membershipsByTypeId = new Map<string, ImportMembership[]>();

  for (const membership of memberships) {
    const membershipsForType = membershipsByTypeId.get(membership.membershipTypeId) ?? [];
    membershipsForType.push(membership);
    membershipsByTypeId.set(membership.membershipTypeId, membershipsForType);
  }

  return membershipsByTypeId;
}

async function loadMembershipLookup(): Promise<MembershipLookup> {
  const membershipTypes = await db.select().from(table.membershipType);
  const memberships = await db
    .select({
      id: table.membership.id,
      membershipTypeId: table.membership.membershipTypeId,
      startTime: table.membership.startTime,
      endTime: table.membership.endTime,
    })
    .from(table.membership);

  return {
    validTypeIds: new Set(membershipTypes.map((membershipType) => membershipType.id)),
    membershipsByTypeId: groupMembershipsByTypeId(memberships),
  };
}

async function loadUserIdsByEmail(rows: CsvRow[]): Promise<Map<string, string>> {
  const uniqueEmails = [...new Set(rows.map((row) => row.email))];
  const existingUsersByEmail = await getUsersByEmails(uniqueEmails);

  return new Map(Array.from(existingUsersByEmail, ([email, user]) => [email, user.id]));
}

function normalizeImportEmails(rows: CsvRow[]): CsvRow[] {
  return rows.map((row) => ({ ...row, email: normalizeEmail(row.email) }));
}

function sortRowsByLatestMembershipStart(rows: CsvRow[]): RowReference[] {
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .toSorted((a, b) => new Date(b.row.membershipStartDate).getTime() - new Date(a.row.membershipStartDate).getTime());
}

function buildImportError(row: CsvRow, originalIndex: number, message: string): ImportError {
  return {
    row: originalIndex + 1,
    email: row.email,
    error: message,
  };
}

function findImportMembership(
  { row, originalIndex }: RowReference,
  { validTypeIds, membershipsByTypeId }: MembershipLookup,
): ImportMembership | ImportError {
  const membershipStartDate = new Date(row.membershipStartDate);

  if (Number.isNaN(membershipStartDate.getTime())) {
    return buildImportError(row, originalIndex, `Invalid membership start date "${row.membershipStartDate}"`);
  }

  if (!validTypeIds.has(row.membershipTypeId)) {
    return buildImportError(row, originalIndex, `Membership type ID "${row.membershipTypeId}" not found`);
  }

  const membershipOptions = membershipsByTypeId.get(row.membershipTypeId);
  if (!membershipOptions?.length) {
    return buildImportError(row, originalIndex, `No memberships found for type "${row.membershipTypeId}"`);
  }

  const matchingMembership = membershipOptions.find(
    (membership) => membership.startTime.getTime() === membershipStartDate.getTime(),
  );

  return (
    matchingMembership ??
    buildImportError(
      row,
      originalIndex,
      `No membership found for type "${row.membershipTypeId}" starting on ${row.membershipStartDate}`,
    )
  );
}

function prepareImportRow(
  rowReference: RowReference,
  membershipLookup: MembershipLookup,
  userIdsByEmail: Map<string, string>,
  now: Date,
): ProcessedImportRow | ImportError {
  const membership = findImportMembership(rowReference, membershipLookup);
  if ("error" in membership) {
    return membership;
  }

  const existingUserId = userIdsByEmail.get(rowReference.row.email);
  const userId = existingUserId ?? generateUserId();
  const isNewUser = !existingUserId;

  if (isNewUser) {
    userIdsByEmail.set(rowReference.row.email, userId);
  }

  return {
    index: rowReference.originalIndex,
    row: rowReference.row,
    userId,
    membershipId: membership.id,
    status: membership.endTime < now ? "resigned" : "active",
    isNewUser,
  };
}

function prepareImportRows(
  rows: CsvRow[],
  membershipLookup: MembershipLookup,
  userIdsByEmail: Map<string, string>,
): { processedRows: ProcessedImportRow[]; errors: ImportError[] } {
  const processedRows: ProcessedImportRow[] = [];
  const errors: ImportError[] = [];
  const now = new Date();

  for (const rowReference of sortRowsByLatestMembershipStart(rows)) {
    const result = prepareImportRow(rowReference, membershipLookup, userIdsByEmail, now);
    if ("error" in result) {
      errors.push(result);
    } else {
      processedRows.push(result);
    }
  }

  return { processedRows, errors };
}

function uniqueProcessedRowsByEmail(rows: ProcessedImportRow[]): ProcessedImportRow[] {
  const rowsByEmail = new Map<string, ProcessedImportRow>();

  for (const row of rows) {
    if (!rowsByEmail.has(row.row.email)) {
      rowsByEmail.set(row.row.email, row);
    }
  }

  return Array.from(rowsByEmail.values());
}

function isAllowedEmailValue(value: string | undefined): boolean {
  return ["true", "yes"].includes(value?.toLowerCase().trim() ?? "");
}

async function insertNewUsers(processedRows: ProcessedImportRow[]): Promise<ProcessedImportRow[]> {
  const uniqueNewUsers = uniqueProcessedRowsByEmail(processedRows.filter((row) => row.isNewUser));

  for (let i = 0; i < uniqueNewUsers.length; i += IMPORT_BATCH_SIZE) {
    const batch = uniqueNewUsers.slice(i, i + IMPORT_BATCH_SIZE);
    const userValues = batch.map((processedRow) => ({
      id: processedRow.userId,
      email: processedRow.row.email,
      firstNames: processedRow.row.firstNames,
      lastName: processedRow.row.lastName,
      homeMunicipality: processedRow.row.homeMunicipality,
      adminRole: "none" as const,
      isAllowedEmails: isAllowedEmailValue(processedRow.row.isAllowedEmails),
    }));

    if (userValues.length > 0) {
      await db.insert(table.user).values(userValues);
    }
  }

  return uniqueNewUsers;
}

async function updateExistingUsers(processedRows: ProcessedImportRow[], errors: ImportError[]): Promise<void> {
  const uniqueExistingUsers = uniqueProcessedRowsByEmail(processedRows.filter((row) => !row.isNewUser));

  for (const processedRow of uniqueExistingUsers) {
    try {
      await db
        .update(table.user)
        .set({
          firstNames: processedRow.row.firstNames,
          lastName: processedRow.row.lastName,
          homeMunicipality: processedRow.row.homeMunicipality,
        })
        .where(eq(table.user.id, processedRow.userId));
    } catch (err) {
      errors.push(
        buildImportError(
          processedRow.row,
          processedRow.index,
          err instanceof Error ? err.message : "Failed to update user",
        ),
      );
    }
  }
}

async function loadExistingMemberKeys(processedRows: ProcessedImportRow[]): Promise<Set<string>> {
  const userIds = [...new Set(processedRows.map((processedRow) => processedRow.userId))];
  const existingMemberKeys = new Set<string>();

  for (let i = 0; i < userIds.length; i += IMPORT_BATCH_SIZE) {
    const userIdBatch = userIds.slice(i, i + IMPORT_BATCH_SIZE);
    if (userIdBatch.length === 0) continue;

    const existingMembers = await db
      .select({
        userId: table.member.userId,
        membershipId: table.member.membershipId,
      })
      .from(table.member)
      .where(inArray(table.member.userId, userIdBatch));

    for (const member of existingMembers) {
      existingMemberKeys.add(`${member.userId}:${member.membershipId}`);
    }
  }

  return existingMemberKeys;
}

function getNewMemberRows(processedRows: ProcessedImportRow[], existingMemberKeys: Set<string>): ProcessedImportRow[] {
  const rowsByMemberKey = new Map<string, ProcessedImportRow>();

  for (const processedRow of processedRows) {
    const memberKey = `${processedRow.userId}:${processedRow.membershipId}`;
    if (!existingMemberKeys.has(memberKey) && !rowsByMemberKey.has(memberKey)) {
      rowsByMemberKey.set(memberKey, processedRow);
    }
  }

  return Array.from(rowsByMemberKey.values());
}

async function insertMemberBatch(memberRows: ProcessedImportRow[], errors: ImportError[]): Promise<void> {
  const rowByMemberKey = new Map<string, ProcessedImportRow>();
  const memberValues = memberRows.map((processedRow) => {
    const memberKey = `${processedRow.userId}:${processedRow.membershipId}`;
    rowByMemberKey.set(memberKey, processedRow);

    return {
      id: crypto.randomUUID(),
      userId: processedRow.userId,
      membershipId: processedRow.membershipId,
      status: processedRow.status,
    };
  });

  try {
    await db.insert(table.member).values(memberValues);
  } catch {
    await insertMemberBatchIndividually(memberValues, rowByMemberKey, errors);
  }
}

async function insertMemberBatchIndividually(
  memberValues: Array<{ id: string; userId: string; membershipId: string; status: "active" | "resigned" }>,
  rowByMemberKey: Map<string, ProcessedImportRow>,
  errors: ImportError[],
): Promise<void> {
  for (const memberValue of memberValues) {
    const memberKey = `${memberValue.userId}:${memberValue.membershipId}`;
    const processedRow = rowByMemberKey.get(memberKey);

    try {
      await db.insert(table.member).values(memberValue);
    } catch (innerErr) {
      if (!processedRow) continue;

      errors.push(
        buildImportError(
          processedRow.row,
          processedRow.index,
          innerErr instanceof Error ? innerErr.message : "Failed to create member record",
        ),
      );
    }
  }
}

async function insertNewMembers(memberRows: ProcessedImportRow[], errors: ImportError[]): Promise<void> {
  for (let i = 0; i < memberRows.length; i += IMPORT_BATCH_SIZE) {
    const batch = memberRows.slice(i, i + IMPORT_BATCH_SIZE);
    if (batch.length > 0) {
      await insertMemberBatch(batch, errors);
    }
  }
}

export const importMembers = form(importMembersSchema, async ({ rows: rowsJson }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  const parsedRows = parseImportRows(rowsJson, LL.admin.import.invalidDataFormat());
  const membershipLookup = await loadMembershipLookup();
  const userIdsByEmail = await loadUserIdsByEmail(parsedRows);
  const rows = normalizeImportEmails(parsedRows);
  const { processedRows, errors } = prepareImportRows(rows, membershipLookup, userIdsByEmail);

  const uniqueNewUsers = await insertNewUsers(processedRows);
  await updateExistingUsers(processedRows, errors);

  const existingMemberKeys = await loadExistingMemberKeys(processedRows);
  const membersToInsert = getNewMemberRows(processedRows, existingMemberKeys);
  await insertNewMembers(membersToInsert, errors);

  const errorRowIndices = new Set(errors.map((e) => e.row - 1));
  const successCount = rows.length - errorRowIndices.size;

  await auditFromEvent(event, "member.bulk_import", {
    targetType: "member",
    metadata: {
      totalRows: rows.length,
      successCount,
      errorCount: errors.length,
      newUsersCreated: uniqueNewUsers.length,
      membersCreated: membersToInsert.length,
    },
  });

  return {
    success: true,
    successCount,
    totalRows: rows.length,
    errors,
  };
});

// Create a single legacy membership (no Stripe price)
export const createLegacyMembership = command(createLegacyMembershipSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  const membership = await db
    .insert(table.membership)
    .values({
      id: crypto.randomUUID(),
      membershipTypeId: data.membershipTypeId,
      stripePriceId: null,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      requiresStudentVerification: false,
    })
    .onConflictDoNothing({ target: [table.membership.membershipTypeId, table.membership.startTime] })
    .returning();

  if (membership[0]) {
    await auditFromEvent(event, "membership.create", {
      targetType: "membership",
      targetId: membership[0].id,
      metadata: {
        membershipTypeId: data.membershipTypeId,
        startTime: data.startTime,
        endTime: data.endTime,
        legacy: true,
      },
    });
  }

  return { success: true, membership: membership[0] ?? null };
});

// Batch create multiple legacy memberships
export const createLegacyMemberships = command(createLegacyMembershipsBatchSchema, async ({ memberships }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  const created = await db
    .insert(table.membership)
    .values(
      memberships.map((m) => ({
        id: crypto.randomUUID(),
        membershipTypeId: m.membershipTypeId,
        stripePriceId: null,
        startTime: new Date(m.startTime),
        endTime: new Date(m.endTime),
        requiresStudentVerification: false,
      })),
    )
    .onConflictDoNothing({ target: [table.membership.membershipTypeId, table.membership.startTime] })
    .returning();

  if (created.length > 0) {
    await auditFromEvent(event, "membership.create", {
      targetType: "membership",
      metadata: { count: created.length, legacy: true, batch: true },
    });
  }

  return { success: true, count: created.length };
});
