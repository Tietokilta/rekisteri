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

  const rowsValidation = v.safeParse(v.array(csvRowSchema), rows);
  if (!rowsValidation.success) {
    const issues = rowsValidation.issues
      .slice(0, 5) // Limit to first 5 issues
      .map((issue) => {
        const path = issue.path?.map((p) => p.key).join(".") || "unknown";
        return `Row ${path}: ${issue.message}`;
      })
      .join("; ");
    error(400, `Validation failed: ${issues}`);
  }

  // Fetch all membership types to validate IDs
  const membershipTypes = await db.select().from(table.membershipType);
  const validTypeIds = new Set(membershipTypes.map((mt) => mt.id));

  // Fetch all memberships with their type info
  const memberships = await db
    .select({
      id: table.membership.id,
      membershipTypeId: table.membership.membershipTypeId,
      startTime: table.membership.startTime,
      endTime: table.membership.endTime,
    })
    .from(table.membership);

  // Group memberships by membershipTypeId
  const membershipsByTypeId = new Map<string, typeof memberships>();
  for (const membership of memberships) {
    const existing = membershipsByTypeId.get(membership.membershipTypeId);
    if (existing) {
      existing.push(membership);
    } else {
      membershipsByTypeId.set(membership.membershipTypeId, [membership]);
    }
  }

  const errors: Array<{ row: number; email: string; error: string }> = [];
  let successCount = 0;

  // Step 1: Validate all rows and prepare data structures
  type ProcessedRow = {
    index: number;
    row: CsvRow;
    userId: string;
    membershipId: string;
    status: "active" | "expired";
    isNewUser: boolean;
  };

  const processedRows: ProcessedRow[] = [];

  // Fetch all emails at once to check which users already exist
  const allEmails = rows.map((r) => r.email);
  const uniqueEmails = [...new Set(allEmails)];

  // Batch lookup all users by email (including verified secondary emails)
  const emailToUserMap = await getUsersByEmails(uniqueEmails);
  const emailToUserId = new Map<string, string>();

  for (const [email, user] of emailToUserMap) {
    emailToUserId.set(email, user.id);
  }

  // Validate and prepare all rows
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

      // Check if membership type ID is valid
      if (!validTypeIds.has(row.membershipTypeId)) {
        errors.push({
          row: i + 1,
          email: row.email,
          error: `Membership type ID "${row.membershipTypeId}" not found`,
        });
        continue;
      }

      // Get memberships for this type
      const membershipOptions = membershipsByTypeId.get(row.membershipTypeId);
      if (!membershipOptions || membershipOptions.length === 0) {
        errors.push({
          row: i + 1,
          email: row.email,
          error: `No memberships found for type "${row.membershipTypeId}"`,
        });
        continue;
      }

      // Find membership matching both type and start date
      const targetMembership = membershipOptions.find((m) => m.startTime.getTime() === membershipStartDate.getTime());

      if (!targetMembership) {
        errors.push({
          row: i + 1,
          email: row.email,
          error: `No membership found for type "${row.membershipTypeId}" starting on ${row.membershipStartDate}`,
        });
        continue;
      }

      // Determine if user exists or needs to be created
      const existingUserId = emailToUserId.get(row.email);
      const userId = existingUserId || generateUserId();
      const isNewUser = !existingUserId;

      // Store for later
      if (isNewUser) {
        emailToUserId.set(row.email, userId);
      }

      // Determine member status based on membership end date
      const now = new Date();
      const status = targetMembership.endTime < now ? "expired" : "active";

      processedRows.push({
        index: i,
        row,
        userId,
        membershipId: targetMembership.id,
        status,
        isNewUser,
      });
    } catch (err) {
      errors.push({
        row: i + 1,
        email: row.email,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Step 2: Batch insert new users (in chunks of 500)
  const BATCH_SIZE = 500;
  const newUsers = processedRows.filter((p) => p.isNewUser);
  const newUsersByEmail = new Map<string, ProcessedRow>();

  // Deduplicate by email (in case CSV has duplicate emails)
  for (const processed of newUsers) {
    if (!newUsersByEmail.has(processed.row.email)) {
      newUsersByEmail.set(processed.row.email, processed);
    }
  }

  const uniqueNewUsers = Array.from(newUsersByEmail.values());

  for (let i = 0; i < uniqueNewUsers.length; i += BATCH_SIZE) {
    const batch = uniqueNewUsers.slice(i, i + BATCH_SIZE);
    const userValues = batch.map((p) => ({
      id: p.userId,
      email: p.row.email,
      firstNames: p.row.firstNames,
      lastName: p.row.lastName,
      homeMunicipality: p.row.homeMunicipality,
      isAdmin: false,
      isAllowedEmails: false,
    }));

    if (userValues.length > 0) {
      await db.insert(table.user).values(userValues);
    }
  }

  // Step 3: Batch update existing users (in chunks of 500)
  const existingUsers = processedRows.filter((p) => !p.isNewUser);
  const existingUsersByEmail = new Map<string, ProcessedRow>();

  // Deduplicate by email
  for (const processed of existingUsers) {
    if (!existingUsersByEmail.has(processed.row.email)) {
      existingUsersByEmail.set(processed.row.email, processed);
    }
  }

  const uniqueExistingUsers = Array.from(existingUsersByEmail.values());

  // Update existing users one by one (Drizzle doesn't support batch updates well)
  for (const processed of uniqueExistingUsers) {
    try {
      await db
        .update(table.user)
        .set({
          firstNames: processed.row.firstNames,
          lastName: processed.row.lastName,
          homeMunicipality: processed.row.homeMunicipality,
        })
        .where(eq(table.user.id, processed.userId));
    } catch (err) {
      errors.push({
        row: processed.index + 1,
        email: processed.row.email,
        error: err instanceof Error ? err.message : "Failed to update user",
      });
    }
  }

  // Step 4: Check which member records already exist
  const allUserIds = [...new Set(processedRows.map((p) => p.userId))];
  const existingMemberSet = new Set<string>();

  // Query existing members in batches to avoid hitting query size limits
  for (let i = 0; i < allUserIds.length; i += BATCH_SIZE) {
    const userIdBatch = allUserIds.slice(i, i + BATCH_SIZE);

    if (userIdBatch.length === 0) continue;

    const existingMembers = await db
      .select({
        userId: table.member.userId,
        membershipId: table.member.membershipId,
      })
      .from(table.member)
      .where(inArray(table.member.userId, userIdBatch));

    for (const member of existingMembers) {
      existingMemberSet.add(`${member.userId}:${member.membershipId}`);
    }
  }

  // Step 5: Batch insert new member records (in chunks of 500)
  const newMembers = processedRows.filter((p) => {
    const key = `${p.userId}:${p.membershipId}`;
    return !existingMemberSet.has(key);
  });

  // Deduplicate member records (in case CSV has duplicates)
  const uniqueMembers = new Map<string, ProcessedRow>();
  for (const processed of newMembers) {
    const key = `${processed.userId}:${processed.membershipId}`;
    if (!uniqueMembers.has(key)) {
      uniqueMembers.set(key, processed);
    }
  }

  const membersToInsert = Array.from(uniqueMembers.values());

  for (let i = 0; i < membersToInsert.length; i += BATCH_SIZE) {
    const batch = membersToInsert.slice(i, i + BATCH_SIZE);

    // Create lookup map to avoid O(n²) complexity during error handling
    const valueToProcessed = new Map<string, ProcessedRow>();
    const memberValues = batch.map((p) => {
      const id = crypto.randomUUID();
      const key = `${p.userId}:${p.membershipId}`;
      valueToProcessed.set(key, p);
      return {
        id,
        userId: p.userId,
        membershipId: p.membershipId,
        status: p.status,
      };
    });

    if (memberValues.length > 0) {
      try {
        await db.insert(table.member).values(memberValues);
      } catch {
        // If batch insert fails, try individually to identify the problematic rows
        for (const value of memberValues) {
          const key = `${value.userId}:${value.membershipId}`;
          const processed = valueToProcessed.get(key);
          try {
            await db.insert(table.member).values(value);
          } catch (innerErr) {
            if (processed) {
              errors.push({
                row: processed.index + 1,
                email: processed.row.email,
                error: innerErr instanceof Error ? innerErr.message : "Failed to create member record",
              });
            }
          }
        }
      }
    }
  }

  // Count successful imports (rows that didn't generate errors)
  const errorRowIndices = new Set(errors.map((e) => e.row - 1));
  successCount = rows.length - errorRowIndices.size;

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

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
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
    .returning();

  return { success: true, membership: membership[0] };
});

// Batch create multiple legacy memberships
export const createLegacyMemberships = command(createLegacyMembershipsBatchSchema, async ({ memberships }) => {
  const event = getRequestEvent();

  if (!event.locals.session || !event.locals.user?.isAdmin) {
    error(404, "Not found");
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
    .returning();

  return { success: true, count: created.length };
});
