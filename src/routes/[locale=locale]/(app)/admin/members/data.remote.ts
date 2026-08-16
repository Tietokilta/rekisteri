import { error } from "@sveltejs/kit";
import { getRequestEvent, command } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { auditFromEvent, auditMemberAction, auditBulkMemberAction } from "$lib/server/audit";
import {
  memberIdSchema,
  memberIdWithReasonSchema,
  bulkMemberIdsSchema,
  bulkMemberIdsWithReasonSchema,
  changeMemberTypeSchema,
  createMemberSchema,
} from "./schema";
import { getLL } from "$lib/server/i18n";
import { sendMemberEmail } from "$lib/server/emails";
import { getUserLocale } from "$lib/server/utils/user";
import { generateUserId } from "$lib/server/auth/utils";
import { getDisplayFirstName } from "$lib/utils";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import { stripe } from "$lib/server/payment";
import type { InferOutput } from "valibot";
import {
  approveMembership,
  approveMembershipInTransaction,
  correctMembershipType,
  correctMembershipEnding,
  endMembership,
  endMembershipForNonPayment,
  endMembershipInTransaction,
  rejectMembership,
} from "$lib/server/membership/admin-actions";

type CreateMemberData = InferOutput<typeof createMemberSchema>;
type CreateAssociationMemberData = Extract<CreateMemberData, { type: "association" }>;
type CreatePersonMemberData = Extract<CreateMemberData, { type: "person" }>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type UserProfileUpdates = Partial<{ firstNames: string; lastName: string; homeMunicipality: string }>;

async function assertMembershipExists(membershipId: string, missingMembershipMessage: string) {
  const membership = await db.query.membershipFeePeriod.findFirst({
    where: { id: membershipId },
    with: { membershipType: true },
  });

  if (!membership) {
    error(400, missingMembershipMessage);
  }
  return membership;
}

async function createAssociationMemberInTransaction(
  tx: DbTransaction,
  memberId: string,
  data: CreateAssociationMemberData,
  membershipTypeId: string,
  duplicateMembershipMessage: string,
): Promise<void> {
  const existingMember = await tx.query.member.findFirst({
    where: { organizationName: data.organizationName },
  });

  if (existingMember) {
    error(400, duplicateMembershipMessage);
  }

  await tx.insert(table.member).values({
    id: memberId,
    userId: null,
    organizationName: data.organizationName,
    status: data.status,
    membershipTypeId: data.status === "active" ? membershipTypeId : null,
    pendingMembershipTypeId: data.status === "awaiting_approval" ? membershipTypeId : null,
    currentMembershipStartedAt: data.status === "active" ? new Date() : null,
    applicationMotive: data.description || null,
  });
}

function getMissingProfileUpdates(existingUser: typeof table.user.$inferSelect, data: CreatePersonMemberData) {
  const updates: UserProfileUpdates = {};

  if (!existingUser.firstNames && data.firstNames) updates.firstNames = data.firstNames;
  if (!existingUser.lastName && data.lastName) updates.lastName = data.lastName;
  if (!existingUser.homeMunicipality && data.homeMunicipality) updates.homeMunicipality = data.homeMunicipality;

  return updates;
}

async function updateMissingUserProfile(
  tx: DbTransaction,
  existingUser: typeof table.user.$inferSelect,
  data: CreatePersonMemberData,
): Promise<void> {
  const updates = getMissingProfileUpdates(existingUser, data);
  if (Object.keys(updates).length > 0) {
    await tx.update(table.user).set(updates).where(eq(table.user.id, existingUser.id));
  }
}

async function assertNoDuplicatePersonMembership(
  tx: DbTransaction,
  userId: string,
  duplicateMembershipMessage: string,
): Promise<void> {
  const existingMember = await tx.query.member.findFirst({
    where: { userId },
  });

  if (existingMember) {
    error(400, duplicateMembershipMessage);
  }
}

async function findOrCreateUserForMember(
  tx: DbTransaction,
  data: CreatePersonMemberData,
  duplicateMembershipMessage: string,
): Promise<string> {
  const normalizedEmail = data.email.toLowerCase().trim();

  const existingUser = await tx.query.user.findFirst({
    where: { email: normalizedEmail },
  });

  if (!existingUser) {
    const userId = generateUserId();
    await tx.insert(table.user).values({
      id: userId,
      email: normalizedEmail,
      firstNames: data.firstNames || null,
      lastName: data.lastName || null,
      homeMunicipality: data.homeMunicipality || null,
    });
    return userId;
  }

  await assertNoDuplicatePersonMembership(tx, existingUser.id, duplicateMembershipMessage);
  await updateMissingUserProfile(tx, existingUser, data);

  return existingUser.id;
}

async function createPersonMemberInTransaction(
  tx: DbTransaction,
  memberId: string,
  data: CreatePersonMemberData,
  membershipTypeId: string,
  duplicateMembershipMessage: string,
): Promise<void> {
  const userId = await findOrCreateUserForMember(tx, data, duplicateMembershipMessage);

  await tx.insert(table.member).values({
    id: memberId,
    userId,
    status: data.status,
    membershipTypeId: data.status === "active" ? membershipTypeId : null,
    pendingMembershipTypeId: data.status === "awaiting_approval" ? membershipTypeId : null,
    currentMembershipStartedAt: data.status === "active" ? new Date() : null,
    applicationMotive: data.description || null,
  });
}

async function createMemberInTransaction(
  tx: DbTransaction,
  memberId: string,
  data: CreateMemberData,
  membershipTypeId: string,
  duplicateMembershipMessage: string,
): Promise<void> {
  if (data.type === "association") {
    await createAssociationMemberInTransaction(tx, memberId, data, membershipTypeId, duplicateMembershipMessage);
    return;
  }

  await createPersonMemberInTransaction(tx, memberId, data, membershipTypeId, duplicateMembershipMessage);
}

export const approveMember = command(memberIdSchema, async ({ memberId }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  try {
    await approveMembership(memberId, event.locals.user.id);
  } catch (approvalError) {
    if (approvalError instanceof Error) {
      if (approvalError.message === "not_awaiting_approval") {
        error(400, LL.admin.members.notAwaitingApproval());
      }
      if (
        ["pending_fee_period_not_found", "pending_fee_period_not_payable", "pending_obligation_not_settled"].includes(
          approvalError.message,
        )
      ) {
        error(400, LL.admin.members.paymentRequiredBeforeApproval());
      }
    }
    throw approvalError;
  }

  await auditMemberAction(event, "member.approve", memberId, {
    model: "indefinite_membership",
  });

  // Send membership approved email
  try {
    const memberWithDetails = await db.query.member.findFirst({
      where: { id: memberId },
      with: {
        user: true,
        membershipType: true,
      },
    });

    if (memberWithDetails?.user && memberWithDetails.membershipType) {
      const userLocale = getUserLocale(memberWithDetails.user);

      await sendMemberEmail({
        recipientEmail: memberWithDetails.user.email,
        emailType: "membership_approved",
        metadata: {
          firstName: getDisplayFirstName(memberWithDetails.user),
          membershipName: memberWithDetails.membershipType.name[userLocale],
        },
        locale: userLocale,
      });
    }
  } catch (emailError) {
    // Log but don't fail the approval if email fails
    console.error("[approveMember] Failed to send membership approved email:", emailError);
  }

  return { success: true, message: "Member approved successfully" };
});

export const rejectMember = command(memberIdWithReasonSchema, async ({ memberId, reason }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  try {
    await rejectMembership(memberId, event.locals.user.id, reason);
  } catch (rejectionError) {
    if (rejectionError instanceof Error && rejectionError.message === "cannot_reject") {
      error(400, LL.admin.members.cannotReject());
    }
    throw rejectionError;
  }

  await auditMemberAction(event, "member.reject", memberId, {
    reason,
    model: "indefinite_membership",
  });

  return { success: true, message: "Member rejected successfully" };
});

/**
 * Deem a member as resigned (eronneeksi katsominen).
 * Used when the board deems a member resigned for non-payment (§8 p2)
 * or for the year-end mass cleanup.
 */
export const markMemberResigned = command(memberIdWithReasonSchema, async ({ memberId, reason }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  try {
    await endMembershipForNonPayment(memberId, event.locals.user.id, reason);
  } catch (endingError) {
    if (
      endingError instanceof Error &&
      (endingError.message === "cannot_end" || endingError.message === "nonpayment_not_actionable")
    ) {
      error(400, LL.admin.members.cannotDeemResigned());
    }
    throw endingError;
  }

  await auditMemberAction(event, "member.deem_resigned", memberId, {
    reason,
    model: "indefinite_membership",
  });

  return { success: true, message: "Member deemed resigned" };
});

/**
 * Record a member's voluntary resignation (eroaminen).
 * Used when a member explicitly asks to leave the guild (§8 p1).
 */
export const resignMember = command(memberIdWithReasonSchema, async ({ memberId, reason }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  try {
    await endMembership(memberId, event.locals.user.id, "resigned_voluntarily", reason);
  } catch (endingError) {
    if (endingError instanceof Error && endingError.message === "cannot_end") {
      error(400, LL.admin.members.cannotResign());
    }
    throw endingError;
  }

  await auditMemberAction(event, "member.resign", memberId, {
    reason,
    model: "indefinite_membership",
  });

  return { success: true, message: "Membership resignation recorded" };
});

export const reactivateMember = command(memberIdWithReasonSchema, async ({ memberId, reason }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  if (!reason?.trim()) {
    error(400, LL.admin.members.cannotReactivate());
  }
  try {
    await correctMembershipEnding(memberId, event.locals.user.id, reason.trim());
  } catch (correctionError) {
    if (correctionError instanceof Error && correctionError.message === "cannot_correct_ending") {
      error(400, LL.admin.members.cannotReactivate());
    }
    throw correctionError;
  }

  await auditMemberAction(event, "member.reactivate", memberId, {
    reason,
    changeKind: "ending_correction",
  });

  return { success: true, message: "Membership reactivated successfully" };
});

export const changeMemberType = command(changeMemberTypeSchema, async ({ memberId, targetMembershipId }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  let correction: Awaited<ReturnType<typeof correctMembershipType>>;
  try {
    correction = await correctMembershipType(
      memberId,
      targetMembershipId,
      event.locals.user.id,
      async (sourceStripePriceId, targetStripePriceId) => {
        if (sourceStripePriceId === targetStripePriceId) return;
        let sourcePrice;
        let targetPrice;
        try {
          [sourcePrice, targetPrice] = await Promise.all([
            stripe.prices.retrieve(sourceStripePriceId),
            stripe.prices.retrieve(targetStripePriceId),
          ]);
        } catch {
          throw new Error("price_check_failed");
        }
        if (
          sourcePrice.unit_amount === null ||
          targetPrice.unit_amount === null ||
          sourcePrice.unit_amount !== targetPrice.unit_amount ||
          sourcePrice.currency !== targetPrice.currency
        ) {
          throw new Error("price_mismatch");
        }
      },
    );
  } catch (correctionError: unknown) {
    if (correctionError instanceof Error) {
      if (correctionError.message === "period_mismatch") {
        error(400, LL.admin.members.membershipTypeChangePeriodMismatch());
      }
      if (correctionError.message === "membership_type_unchanged") {
        error(400, LL.admin.members.membershipTypeUnchanged());
      }
      if (correctionError.message === "price_mismatch") {
        error(400, LL.admin.members.membershipTypeChangePriceMismatch());
      }
      if (correctionError.message === "cannot_correct_type") {
        error(400, LL.admin.members.cannotChangeMembershipTypeFromStatus());
      }
      if (correctionError.message === "correction_conflict") {
        error(409, LL.admin.members.membershipTypeChangeConflict());
      }
      if (correctionError.message === "price_check_failed") {
        error(502, LL.admin.members.membershipTypeChangePriceCheckFailed());
      }
    }
    throw correctionError;
  }

  await auditMemberAction(event, "member.type_change", memberId, {
    changeKind: "purchase_correction",
    ...correction,
    model: "indefinite_membership",
  });

  return { success: true };
});

export const createMember = command(createMemberSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }
  const actorUserId = event.locals.user.id;

  const membership = await assertMembershipExists(data.membershipId, LL.admin.members.membershipNotFound());
  if (membership.membershipType.requiresPayment && !data.description?.trim()) {
    error(400, LL.membership.descriptionRequired());
  }

  const memberId = crypto.randomUUID();

  // NOTE: error() throws a SvelteKit HttpError which aborts the transaction (auto-rollback)
  await db.transaction(async (tx) => {
    await createMemberInTransaction(
      tx,
      memberId,
      data,
      membership.membershipTypeId,
      LL.admin.members.duplicateMembership(),
    );
    if (membership.membershipType.requiresPayment) {
      await tx.insert(table.membershipObligation).values({
        id: crypto.randomUUID(),
        memberId,
        membershipFeePeriodId: membership.id,
        kind: "application",
        disposition: "waived",
        dispositionReason: data.description?.trim(),
      });
    }
    await tx.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId,
      eventType: data.status === "active" ? "application_approved" : "application_submitted",
      effectiveAt: new Date(),
      source: "admin",
      certainty: "confirmed",
      actorUserId,
      membershipFeePeriodId: membership.id,
      data: { membershipTypeId: membership.membershipTypeId },
    });
  });

  await auditFromEvent(event, "member.create", {
    targetType: "member",
    targetId: memberId,
    metadata: {
      type: data.type,
      status: data.status,
      ...(data.type === "association" ? { organizationName: data.organizationName } : { email: data.email }),
    },
  });

  return { success: true };
});

// Bulk actions
export const bulkApproveMembers = command(bulkMemberIdsSchema, async ({ memberIds }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }
  const actorUserId = event.locals.user.id;

  const validIds = [...new Set(memberIds)].toSorted((left, right) => left.localeCompare(right));
  try {
    await db.transaction(async (tx) => {
      for (const id of validIds) await approveMembershipInTransaction(tx, id, actorUserId);
    });
  } catch (approvalError) {
    if (approvalError instanceof Error) {
      if (approvalError.message === "not_awaiting_approval") {
        error(400, LL.admin.members.noMembersAwaitingApproval());
      }
      if (
        ["pending_fee_period_not_found", "pending_fee_period_not_published", "pending_obligation_not_settled"].includes(
          approvalError.message,
        )
      ) {
        error(400, LL.admin.members.paymentRequiredBeforeApproval());
      }
    }
    throw approvalError;
  }

  await auditBulkMemberAction(event, "member.bulk_approve", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  // Send membership approved emails to all approved members
  try {
    const approvedMembersWithDetails = await db.query.member.findMany({
      where: { id: { in: validIds } },
      with: {
        user: true,
        membershipType: true,
      },
    });

    // Send emails in parallel, don't fail if some emails fail
    const membersWithUsers = approvedMembersWithDetails.filter(
      (m): m is typeof m & { user: NonNullable<typeof m.user>; membershipType: NonNullable<typeof m.membershipType> } =>
        m.user !== null && m.membershipType !== null,
    );
    const emailPromises = membersWithUsers.map(async (memberWithDetails) => {
      const userLocale = getUserLocale(memberWithDetails.user);

      return sendMemberEmail({
        recipientEmail: memberWithDetails.user.email,
        emailType: "membership_approved",
        metadata: {
          firstName: getDisplayFirstName(memberWithDetails.user),
          membershipName: memberWithDetails.membershipType.name[userLocale],
        },
        locale: userLocale,
      });
    });

    const results = await Promise.allSettled(emailPromises);
    const failedCount = results.filter((r) => r.status === "rejected").length;

    if (failedCount > 0) {
      console.error(
        `[bulkApproveMembers] Failed to send ${failedCount}/${emailPromises.length} membership approved emails`,
      );
      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          console.error(`  - Email ${index + 1} failed:`, result.reason);
        }
      }
    }
  } catch (emailError) {
    // Log but don't fail the bulk approval if email fetching/sending fails
    console.error("[bulkApproveMembers] Failed to send membership approved emails:", emailError);
  }

  return {
    success: true,
    message: `${validIds.length} member(s) approved successfully`,
    processedCount: validIds.length,
  };
});

/**
 * Bulk deem members as resigned (eronneeksi katsominen).
 * Primarily used for the year-end mass cleanup when the board deems
 * members who haven't paid as resigned per §8 p2.
 */
export const bulkMarkMembersResigned = command(bulkMemberIdsWithReasonSchema, async ({ memberIds, reason }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !event.locals.user || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }
  const actorUserId = event.locals.user.id;

  const validIds = [...new Set(memberIds)].toSorted((left, right) => left.localeCompare(right));
  try {
    await db.transaction(async (tx) => {
      for (const id of validIds) {
        await endMembershipInTransaction(tx, id, actorUserId, "deemed_resigned_nonpayment", reason, true);
      }
    });
  } catch (endingError) {
    if (
      endingError instanceof Error &&
      (endingError.message === "cannot_end" || endingError.message === "nonpayment_not_actionable")
    ) {
      error(400, LL.admin.members.noMembersCanBeResigned());
    }
    throw endingError;
  }

  await auditBulkMemberAction(event, "member.bulk_deem_resigned", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
    reason,
  });

  return {
    success: true,
    message: `${validIds.length} member(s) deemed resigned`,
    processedCount: validIds.length,
  };
});
