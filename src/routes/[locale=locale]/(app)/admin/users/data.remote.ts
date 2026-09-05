import { error } from "@sveltejs/kit";
import { getRequestEvent, command } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { count, eq, sql } from "drizzle-orm";
import { isNonEmpty } from "$lib/utils";
import { updateUserRoleSchema, mergeUsersSchema } from "./schema";
import { auditUserAdminAction } from "$lib/server/audit";
import { getLL } from "$lib/server/i18n";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";

export const updateUserRole = command(updateUserRoleSchema, async ({ userId, role }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);
  const currentUser = event.locals.user;

  if (!event.locals.session || !currentUser || !userHasAdminWriteAccess(currentUser)) {
    error(404, LL.error.resourceNotFound());
  }

  const user = await db.query.user.findFirst({
    where: { id: userId },
  });

  if (!user) {
    error(404, LL.admin.users.userNotFound());
  }

  // Prevent changing your own role
  if (user.id === currentUser.id) {
    error(400, LL.admin.users.cannotChangeOwnRole());
  }

  const previousRole = user.adminRole;

  // No-op if role is unchanged
  if (previousRole === role) {
    return { success: true, message: "No change" };
  }

  await db.transaction(async (tx) => {
    // If demoting from admin, check we're not removing the last admin
    if (previousRole === "admin" && role !== "admin") {
      const adminCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(table.user)
        .where(eq(table.user.adminRole, "admin"));

      if (!isNonEmpty(adminCount) || adminCount[0].count <= 1) {
        error(400, LL.admin.users.cannotDemoteLastAdmin());
      }
    }

    await tx.update(table.user).set({ adminRole: role }).where(eq(table.user.id, userId));
  });

  // Log the action
  await auditUserAdminAction(event, "user.role_change", userId, {
    userEmail: user.email,
    previousRole,
    newRole: role,
  });

  return { success: true, message: "User role updated successfully" };
});

export const mergeUsers = command(
  mergeUsersSchema,
  async ({ primaryUserId, secondaryUserId, confirmPrimaryEmail, confirmSecondaryEmail }) => {
    const event = getRequestEvent();
    const LL = getLL(event.locals.locale);
    const adminUser = event.locals.user;

    if (!event.locals.session || !adminUser || !userHasAdminWriteAccess(adminUser)) {
      error(404, LL.error.resourceNotFound());
    }

    // Validate that users are not the same
    if (primaryUserId === secondaryUserId) {
      error(400, LL.admin.users.cannotMergeSelf());
    }

    // Fetch both users
    const [primaryUser, secondaryUser] = await Promise.all([
      db.query.user.findFirst({ where: { id: primaryUserId } }),

      db.query.user.findFirst({ where: { id: secondaryUserId } }),
    ]);

    if (!primaryUser) {
      error(404, LL.admin.users.primaryUserNotFound());
    }

    if (!secondaryUser) {
      error(404, LL.admin.users.secondaryUserNotFound());
    }

    // Validate email confirmations
    if (primaryUser.email.toLowerCase() !== confirmPrimaryEmail.toLowerCase()) {
      error(400, LL.admin.users.primaryEmailMismatch());
    }

    if (secondaryUser.email.toLowerCase() !== confirmSecondaryEmail.toLowerCase()) {
      error(400, LL.admin.users.secondaryEmailMismatch());
    }

    // Two stable membership aggregates cannot be combined without reconciling
    // their legal histories and current snapshots.
    const [primaryMember, secondaryMember] = await Promise.all([
      db.query.member.findFirst({ where: { userId: primaryUserId }, with: { membershipType: true } }),
      db.query.member.findFirst({ where: { userId: secondaryUserId }, with: { membershipType: true } }),
    ]);

    if (primaryMember && secondaryMember) {
      error(400, LL.admin.users.cannotMergeMembershipRecords());
    }

    let membershipTransferContents: {
      eventCount: number;
      obligationCount: number;
      paymentCount: number;
    } | null = null;
    if (secondaryMember) {
      const [events, obligations, payments] = await Promise.all([
        db
          .select({ count: count() })
          .from(table.membershipEvent)
          .where(eq(table.membershipEvent.memberId, secondaryMember.id)),
        db
          .select({ count: count() })
          .from(table.membershipObligation)
          .where(eq(table.membershipObligation.memberId, secondaryMember.id)),
        db.select({ count: count() }).from(table.payment).where(eq(table.payment.memberId, secondaryMember.id)),
      ]);
      membershipTransferContents = {
        eventCount: events[0]?.count ?? 0,
        obligationCount: obligations[0]?.count ?? 0,
        paymentCount: payments[0]?.count ?? 0,
      };
    }

    // Perform the merge in a transaction
    await db.transaction(async (tx) => {
      // 1. Add the secondary user's primary email as a verified secondary email on the primary user
      await tx.insert(table.secondaryEmail).values({
        id: crypto.randomUUID(),
        userId: primaryUserId,
        email: secondaryUser.email,
        domain: secondaryUser.email.split("@", 2)[1] ?? "",
        verifiedAt: new Date(),
        expiresAt: null, // Was the secondary user's primary email, so it doesn't expire
      });

      // 2. Transfer the secondary user's stable membership aggregate. Events,
      // obligations, and payments remain attached through the member ID.
      if (secondaryMember) {
        await tx.update(table.member).set({ userId: primaryUserId }).where(eq(table.member.userId, secondaryUserId));
      }

      // 3. Move all secondary emails from secondary to primary

      const secondaryUserSecondaryEmails = await tx.query.secondaryEmail.findMany({
        where: { userId: secondaryUserId },
      });

      if (secondaryUserSecondaryEmails.length > 0) {
        await tx
          .update(table.secondaryEmail)
          .set({ userId: primaryUserId })
          .where(eq(table.secondaryEmail.userId, secondaryUserId));
      }

      // 4. Move all passkeys from secondary to primary

      const secondaryUserPasskeys = await tx.query.passkey.findMany({
        where: { userId: secondaryUserId },
      });

      if (secondaryUserPasskeys.length > 0) {
        await tx.update(table.passkey).set({ userId: primaryUserId }).where(eq(table.passkey.userId, secondaryUserId));
      }

      // 5. Move all sessions from secondary to primary
      await tx.update(table.session).set({ userId: primaryUserId }).where(eq(table.session.userId, secondaryUserId));

      // 6. Update audit logs to reference primary user (optional, for history tracking)
      await tx.update(table.auditLog).set({ userId: primaryUserId }).where(eq(table.auditLog.userId, secondaryUserId));

      // Preserve admin/self-service event attribution before deleting the secondary user.
      await tx
        .update(table.membershipEvent)
        .set({ actorUserId: primaryUserId })
        .where(eq(table.membershipEvent.actorUserId, secondaryUserId));

      // 7. Delete the secondary user (cascades will clean up any remaining references)
      await tx.delete(table.user).where(eq(table.user.id, secondaryUserId));

      // 8. Log the merge action within the transaction
      // We need to use tx.insert directly here since we're inside a transaction
      // and auditUserAdminAction would use the outer db instance
      const auditId = crypto.randomUUID();
      await tx.insert(table.auditLog).values({
        id: auditId,
        userId: adminUser.id,
        action: "user.merge",
        targetType: "user",
        targetId: primaryUserId,
        metadata: {
          primaryUserEmail: primaryUser.email,
          secondaryUserEmail: secondaryUser.email,
          secondaryUserId: secondaryUserId,
          membershipTransferred: secondaryMember !== undefined,
          membershipTransferContents,
          movedSecondaryEmailsCount: secondaryUserSecondaryEmails.length,
          movedPasskeysCount: secondaryUserPasskeys.length,
        },
        ipAddress: event.getClientAddress(),
        userAgent: event.request.headers.get("user-agent") ?? undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    return {
      success: true,
      message: `Successfully merged ${secondaryUser.email} into ${primaryUser.email}`,
    };
  },
);
