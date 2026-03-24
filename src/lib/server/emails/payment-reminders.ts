import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db as defaultDb } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { sendMemberEmail } from "$lib/server/emails";
import { getMembershipName } from "$lib/server/utils/membership";
import { getUserLocale } from "$lib/server/utils/user";
import { getDisplayFirstName } from "$lib/utils";
import { env } from "$lib/server/env";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Payment reminder windows relative to paymentDueDate.
 * Negative = before due date, positive = after due date.
 * Ranges handle weekends: first weekday in the window triggers the send.
 */
const REMINDER_WINDOWS = [
  { type: "payment_reminder_30d", minDays: -30, maxDays: -28 },
  { type: "payment_reminder_7d", minDays: -7, maxDays: -5 },
  { type: "payment_reminder_due", minDays: 0, maxDays: 2 },
  { type: "payment_reminder_overdue", minDays: 28, maxDays: 30 },
] as const;

/**
 * Process payment due date reminders.
 * Extracted from cron for testability.
 *
 * Logic:
 * 1. Find memberships with a non-null paymentDueDate
 * 2. For each, find active members of the same type in a PREVIOUS period
 *    who haven't purchased the new membership yet
 * 3. Check which reminder window matches today's date
 * 4. Deduplicate via email_log
 * 5. Send reminders
 */
export async function processPaymentReminders(
  dbInstance?: PostgresJsDatabase<typeof table>,
  now?: Date,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = dbInstance ?? defaultDb;
  const today = now ?? new Date();
  const stats = { sent: 0, skipped: 0, failed: 0 };

  // Find memberships with payment due dates
  const membershipsWithDueDate = await db.query.membership.findMany({
    where: isNotNull(table.membership.paymentDueDate),
    with: {
      membershipType: true,
    },
  });

  for (const membership of membershipsWithDueDate) {
    if (!membership.paymentDueDate) continue;

    // Calculate days until/since due date
    const dueDate = membership.paymentDueDate;
    const diffMs = dueDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Find which reminder window matches
    const matchingWindow = REMINDER_WINDOWS.find((w) => diffDays >= w.minDays && diffDays <= w.maxDays);

    if (!matchingWindow) continue;

    // Find active members of the same type in PREVIOUS periods
    // who have NOT purchased this membership yet
    const previousMemberships = await db
      .select({ id: table.membership.id })
      .from(table.membership)
      .where(
        and(
          eq(table.membership.membershipTypeId, membership.membershipTypeId),
          sql`${table.membership.id} != ${membership.id}`,
          sql`${table.membership.endTime} < ${membership.startTime}`,
        ),
      );

    if (previousMemberships.length === 0) continue;

    const previousMembershipIds = previousMemberships.map((m) => m.id);

    // Find active members from previous periods (only individual members with userId)
    const activeMembers = await db.query.member.findMany({
      where: and(
        eq(table.member.status, "active"),
        sql`${table.member.membershipId} IN (${sql.join(
          previousMembershipIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        sql`${table.member.userId} IS NOT NULL`,
      ),
      with: {
        user: true,
        membership: {
          with: { membershipType: true },
        },
      },
    });

    if (activeMembers.length === 0) continue;

    // Filter out members who already purchased the new membership
    const userIdsWithNewMembership = await db
      .select({ userId: table.member.userId })
      .from(table.member)
      .where(eq(table.member.membershipId, membership.id));

    const purchasedUserIds = new Set(userIdsWithNewMembership.map((m) => m.userId));
    const membersToRemind = activeMembers.filter((m) => m.userId && !purchasedUserIds.has(m.userId));

    if (membersToRemind.length === 0) continue;

    // Check which members already received this reminder type (dedup via email_log)
    const memberIds = membersToRemind.map((m) => m.id);
    const alreadySent = await db
      .select({ relatedMemberId: table.emailLog.relatedMemberId })
      .from(table.emailLog)
      .where(
        and(
          eq(table.emailLog.emailType, matchingWindow.type),
          sql`${table.emailLog.relatedMemberId} IN (${sql.join(
            memberIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
          eq(table.emailLog.status, "sent"),
        ),
      );

    const alreadySentMemberIds = new Set(alreadySent.map((r) => r.relatedMemberId));

    for (const memberRecord of membersToRemind) {
      if (alreadySentMemberIds.has(memberRecord.id)) {
        stats.skipped++;
        continue;
      }

      if (!memberRecord.user) {
        stats.skipped++;
        continue;
      }

      const userLocale = getUserLocale(memberRecord.user);

      try {
        await sendMemberEmail({
          recipientEmail: memberRecord.user.email,
          emailType: "payment_reminder",
          metadata: {
            firstName: getDisplayFirstName(memberRecord.user),
            membershipName: getMembershipName(memberRecord.membership, userLocale),
            dueDate: membership.paymentDueDate,
            paymentLink: `${env.PUBLIC_URL}/${userLocale}/new`,
          },
          locale: userLocale,
          userId: memberRecord.user.id,
          relatedMemberId: memberRecord.id,
          db,
        });
        stats.sent++;
      } catch (error) {
        console.error(`[PaymentReminder] Failed to send ${matchingWindow.type} to user ${memberRecord.userId}:`, error);
        stats.failed++;
      }
    }
  }

  if (stats.sent > 0 || stats.failed > 0) {
    console.log(`[PaymentReminder] Processed: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.failed} failed`);
  }

  return stats;
}
