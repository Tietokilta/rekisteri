import { error } from "@sveltejs/kit";
import { getRequestEvent, command } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db";
import { eq, sql } from "drizzle-orm";
import { isNonEmpty } from "$lib/utils";
import { updateUserRoleSchema, mergeUsersSchema } from "./schema";
import { BLOCKING_MEMBER_STATUSES } from "$lib/shared/enums";
import { auditUserAdminAction } from "$lib/server/audit";
import { getLL } from "$lib/server/i18n";
import { hasAdminWriteAccess } from "$lib/server/auth/admin";

export const updateUserRole = command(updateUserRoleSchema, async ({ userId, role }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);
  const currentUser = event.locals.user;

  if (!event.locals.session || !currentUser || !hasAdminWriteAccess(currentUser)) {
    error(404, LL.error.resourceNotFound());
  }

  const user = await db._query.user.findFirst({
    where: eq(table.user.id, userId),
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

    if (!event.locals.session || !adminUser || !hasAdminWriteAccess(adminUser)) {
      error(404, LL.error.resourceNotFound());
    }

    // Validate that users are not the same
    if (primaryUserId === secondaryUserId) {
      error(400, LL.admin.users.cannotMergeSelf());
    }

    // Fetch both users
    const [primaryUser, secondaryUser] = await Promise.all([
      db._query.user.findFirst({ where: eq(table.user.id, primaryUserId) }),
      db._query.user.findFirst({ where: eq(table.user.id, secondaryUserId) }),
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

    // Check for overlapping memberships
    const [primaryMembers, secondaryMembers] = await Promise.all([
      db._query.member.findMany({
        where: eq(table.member.userId, primaryUserId),
        with: { membership: true },
      }),
      db._query.member.findMany({
        where: eq(table.member.userId, secondaryUserId),
        with: { membership: true },
      }),
    ]);

    // Check for overlapping membership periods (only blocking statuses)
    // Filter out cancelled and expired memberships as they should not block merge
    const activeSecondaryMembers = secondaryMembers.filter((m) => BLOCKING_MEMBER_STATUSES.has(m.status));
    const activePrimaryMembers = primaryMembers.filter((m) => BLOCKING_MEMBER_STATUSES.has(m.status));

    for (const secondaryMember of activeSecondaryMembers) {
      for (const primaryMember of activePrimaryMembers) {
        // Check if same membership type and overlapping periods
        if (secondaryMember.membershipId === primaryMember.membershipId) {
          error(
            400,
            LL.admin.users.cannotMergeOverlapping({
              type: secondaryMember.membership.membershipTypeId,
              startDate: new Date(secondaryMember.membership.startTime).toLocaleDateString(),
              endDate: new Date(secondaryMember.membership.endTime).toLocaleDateString(),
            }),
          );
        }
      }
    }

    // Perform the merge in a transaction
    await db.transaction(async (tx) => {
      // 1. Add the secondary user's primary email as a verified secondary email on the primary user
      await tx.insert(table.secondaryEmail).values({
        id: crypto.randomUUID(),
        userId: primaryUserId,
        email: secondaryUser.email,
        domain: secondaryUser.email.split("@")[1] ?? "",
        verifiedAt: new Date(),
        expiresAt: null, // Was the secondary user's primary email, so it doesn't expire
      });

      // 2. Move all members from secondary to primary
      if (secondaryMembers.length > 0) {
        await tx.update(table.member).set({ userId: primaryUserId }).where(eq(table.member.userId, secondaryUserId));
      }

      // 3. Move all secondary emails from secondary to primary
      const secondaryUserSecondaryEmails = await tx._query.secondaryEmail.findMany({
        where: eq(table.secondaryEmail.userId, secondaryUserId),
      });

      if (secondaryUserSecondaryEmails.length > 0) {
        await tx
          .update(table.secondaryEmail)
          .set({ userId: primaryUserId })
          .where(eq(table.secondaryEmail.userId, secondaryUserId));
      }

      // 4. Move all passkeys from secondary to primary
      const secondaryUserPasskeys = await tx._query.passkey.findMany({
        where: eq(table.passkey.userId, secondaryUserId),
      });

      if (secondaryUserPasskeys.length > 0) {
        await tx.update(table.passkey).set({ userId: primaryUserId }).where(eq(table.passkey.userId, secondaryUserId));
      }

      // 5. Move all sessions from secondary to primary
      await tx.update(table.session).set({ userId: primaryUserId }).where(eq(table.session.userId, secondaryUserId));

      // 6. Update audit logs to reference primary user (optional, for history tracking)
      await tx.update(table.auditLog).set({ userId: primaryUserId }).where(eq(table.auditLog.userId, secondaryUserId));

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
          movedMembersCount: secondaryMembers.length,
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
