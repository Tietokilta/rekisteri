import { error } from "@sveltejs/kit";
import { getRequestEvent, command } from "$app/server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
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
import { getMembershipName } from "$lib/server/utils/membership";
import { getUserLocale } from "$lib/server/utils/user";
import { isValidTransition } from "$lib/server/utils/member";
import { generateUserId } from "$lib/server/auth/utils";
import { getDisplayFirstName } from "$lib/utils";
import { userHasAdminWriteAccess } from "$lib/server/auth/admin";
import type { InferOutput } from "valibot";
import { stripe } from "$lib/server/payment";

type CreateMemberData = InferOutput<typeof createMemberSchema>;
type CreateAssociationMemberData = Extract<CreateMemberData, { type: "association" }>;
type CreatePersonMemberData = Extract<CreateMemberData, { type: "person" }>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type UserProfileUpdates = Partial<{ firstNames: string; lastName: string; homeMunicipality: string }>;

async function assertMembershipExists(membershipId: string, missingMembershipMessage: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const membership = await db._query.membership.findFirst({
    where: eq(table.membership.id, membershipId),
  });

  if (!membership) {
    error(400, missingMembershipMessage);
  }
}

async function createAssociationMemberInTransaction(
  tx: DbTransaction,
  memberId: string,
  data: CreateAssociationMemberData,
  duplicateMembershipMessage: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const existingMember = await tx._query.member.findFirst({
    where: (member, { and }) =>
      and(eq(member.organizationName, data.organizationName), eq(member.membershipId, data.membershipId)),
  });

  if (existingMember) {
    error(400, duplicateMembershipMessage);
  }

  await tx.insert(table.member).values({
    id: memberId,
    userId: null,
    organizationName: data.organizationName,
    membershipId: data.membershipId,
    status: data.status,
    description: data.description || null,
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
  membershipId: string,
  duplicateMembershipMessage: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const existingMember = await tx._query.member.findFirst({
    where: (member, { and }) => and(eq(member.userId, userId), eq(member.membershipId, membershipId)),
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
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const existingUser = await tx._query.user.findFirst({
    where: eq(table.user.email, normalizedEmail),
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

  await assertNoDuplicatePersonMembership(tx, existingUser.id, data.membershipId, duplicateMembershipMessage);
  await updateMissingUserProfile(tx, existingUser, data);

  return existingUser.id;
}

async function createPersonMemberInTransaction(
  tx: DbTransaction,
  memberId: string,
  data: CreatePersonMemberData,
  duplicateMembershipMessage: string,
): Promise<void> {
  const userId = await findOrCreateUserForMember(tx, data, duplicateMembershipMessage);

  await tx.insert(table.member).values({
    id: memberId,
    userId,
    membershipId: data.membershipId,
    status: data.status,
    description: data.description || null,
  });
}

async function createMemberInTransaction(
  tx: DbTransaction,
  memberId: string,
  data: CreateMemberData,
  duplicateMembershipMessage: string,
): Promise<void> {
  if (data.type === "association") {
    await createAssociationMemberInTransaction(tx, memberId, data, duplicateMembershipMessage);
    return;
  }

  await createPersonMemberInTransaction(tx, memberId, data, duplicateMembershipMessage);
}

export const approveMember = command(memberIdSchema, async ({ memberId }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const member = await db._query.member.findFirst({
    where: eq(table.member.id, memberId),
  });

  if (!member) {
    error(404, LL.admin.members.memberNotFound());
  }

  // approveMember is specifically for new applications — resigned/rejected
  // members should go through reactivateMember instead
  if (member.status !== "awaiting_approval" && member.status !== "awaiting_payment") {
    error(400, LL.admin.members.notAwaitingApproval());
  }

  await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

  await auditMemberAction(event, "member.approve", memberId, {
    previousStatus: member.status,
  });

  // Send membership approved email
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const memberWithDetails = await db._query.member.findFirst({
      where: eq(table.member.id, memberId),
      with: {
        user: true,
        membership: {
          with: { membershipType: true },
        },
      },
    });

    if (memberWithDetails?.user) {
      const userLocale = getUserLocale(memberWithDetails.user);

      await sendMemberEmail({
        recipientEmail: memberWithDetails.user.email,
        emailType: "membership_approved",
        metadata: {
          firstName: getDisplayFirstName(memberWithDetails.user),
          membershipName: getMembershipName(memberWithDetails.membership, userLocale),
          startDate: memberWithDetails.membership.startTime,
          endDate: memberWithDetails.membership.endTime,
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

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const member = await db._query.member.findFirst({
    where: eq(table.member.id, memberId),
  });

  if (!member) {
    error(404, LL.admin.members.memberNotFound());
  }

  if (!isValidTransition(member.status, "rejected")) {
    error(400, LL.admin.members.cannotReject());
  }

  await db.update(table.member).set({ status: "rejected" }).where(eq(table.member.id, memberId));

  await auditMemberAction(event, "member.reject", memberId, {
    previousStatus: member.status,
    reason,
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

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const member = await db._query.member.findFirst({
    where: eq(table.member.id, memberId),
  });

  if (!member) {
    error(404, LL.admin.members.memberNotFound());
  }

  if (!isValidTransition(member.status, "resigned")) {
    error(400, LL.admin.members.cannotDeemResigned());
  }

  await db.update(table.member).set({ status: "resigned" }).where(eq(table.member.id, memberId));

  await auditMemberAction(event, "member.deem_resigned", memberId, {
    previousStatus: member.status,
    reason,
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

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const member = await db._query.member.findFirst({
    where: eq(table.member.id, memberId),
  });

  if (!member) {
    error(404, LL.admin.members.memberNotFound());
  }

  if (!isValidTransition(member.status, "resigned")) {
    error(400, LL.admin.members.cannotResign());
  }

  await db.update(table.member).set({ status: "resigned" }).where(eq(table.member.id, memberId));

  await auditMemberAction(event, "member.resign", memberId, {
    previousStatus: member.status,
    reason,
  });

  return { success: true, message: "Membership resignation recorded" };
});

export const reactivateMember = command(memberIdWithReasonSchema, async ({ memberId, reason }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const member = await db._query.member.findFirst({
    where: eq(table.member.id, memberId),
  });

  if (!member) {
    error(404, LL.admin.members.memberNotFound());
  }

  if (!isValidTransition(member.status, "active")) {
    error(400, LL.admin.members.cannotReactivate());
  }

  await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

  await auditMemberAction(event, "member.reactivate", memberId, {
    previousStatus: member.status,
    reason,
  });

  return { success: true, message: "Membership reactivated successfully" };
});

export const changeMemberType = command(changeMemberTypeSchema, async ({ memberId, targetMembershipId }) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const member = await db._query.member.findFirst({
    where: eq(table.member.id, memberId),
    with: {
      membership: {
        with: { membershipType: true },
      },
    },
  });

  if (!member) {
    error(404, LL.admin.members.memberNotFound());
  }

  if (member.status !== "awaiting_approval" && member.status !== "active") {
    error(400, LL.admin.members.cannotChangeMembershipTypeFromStatus());
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const targetMembership = await db._query.membership.findFirst({
    where: eq(table.membership.id, targetMembershipId),
    with: { membershipType: true },
  });

  if (!targetMembership) {
    error(404, LL.admin.members.membershipNotFound());
  }

  const currentMembership = member.membership;
  const isSamePeriod =
    currentMembership.startTime.getTime() === targetMembership.startTime.getTime() &&
    currentMembership.endTime.getTime() === targetMembership.endTime.getTime();

  if (!isSamePeriod) {
    error(400, LL.admin.members.membershipTypeChangePeriodMismatch());
  }

  if (currentMembership.membershipTypeId === targetMembership.membershipTypeId) {
    error(400, LL.admin.members.membershipTypeUnchanged());
  }

  if (!currentMembership.stripePriceId || !targetMembership.stripePriceId) {
    error(400, LL.admin.members.membershipTypeChangeRequiresStripePrice());
  }

  if (currentMembership.stripePriceId !== targetMembership.stripePriceId) {
    try {
      const [currentPrice, targetPrice] = await Promise.all([
        stripe.prices.retrieve(currentMembership.stripePriceId),
        stripe.prices.retrieve(targetMembership.stripePriceId),
      ]);

      if (
        currentPrice.unit_amount === null ||
        targetPrice.unit_amount === null ||
        currentPrice.unit_amount !== targetPrice.unit_amount ||
        currentPrice.currency !== targetPrice.currency
      ) {
        error(400, LL.admin.members.membershipTypeChangePriceMismatch());
      }
    } catch (priceError) {
      if (priceError && typeof priceError === "object" && "status" in priceError) {
        throw priceError;
      }
      console.error("[changeMemberType] Failed to compare Stripe prices:", priceError);
      error(502, LL.admin.members.membershipTypeChangePriceCheckFailed());
    }
  }

  let ownerCondition;
  if (member.userId === null) {
    if (member.organizationName === null) {
      throw new Error(`Member ${member.id} has neither a user nor an organization`);
    }
    ownerCondition = eq(table.member.organizationName, member.organizationName);
  } else {
    ownerCondition = eq(table.member.userId, member.userId);
  }
  const [duplicateMember] = await db
    .select({ id: table.member.id })
    .from(table.member)
    .where(and(ne(table.member.id, memberId), eq(table.member.membershipId, targetMembershipId), ownerCondition))
    .limit(1);

  if (duplicateMember) {
    error(400, LL.admin.members.duplicateMembership());
  }

  const updatedMembers = await db
    .update(table.member)
    .set({ membershipId: targetMembershipId })
    .where(and(eq(table.member.id, memberId), eq(table.member.membershipId, currentMembership.id)))
    .returning({ id: table.member.id });

  if (updatedMembers.length === 0) {
    error(409, LL.admin.members.membershipTypeChangeConflict());
  }

  await auditMemberAction(event, "member.type_change", memberId, {
    changeKind: "purchase_correction",
    previousMembershipId: currentMembership.id,
    previousMembershipTypeId: currentMembership.membershipTypeId,
    previousStripePriceId: currentMembership.stripePriceId,
    targetMembershipId: targetMembership.id,
    targetMembershipTypeId: targetMembership.membershipTypeId,
    targetStripePriceId: targetMembership.stripePriceId,
    periodStart: currentMembership.startTime.toISOString(),
    periodEnd: currentMembership.endTime.toISOString(),
    previousStatus: member.status,
  });

  return { success: true };
});

export const createMember = command(createMemberSchema, async (data) => {
  const event = getRequestEvent();
  const LL = getLL(event.locals.locale);

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  await assertMembershipExists(data.membershipId, LL.admin.members.membershipNotFound());

  const memberId = crypto.randomUUID();

  // NOTE: error() throws a SvelteKit HttpError which aborts the transaction (auto-rollback)
  await db.transaction(async (tx) => {
    await createMemberInTransaction(tx, memberId, data, LL.admin.members.duplicateMembership());
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

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // Fetch all members to validate they exist and can be approved
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const members = await db._query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  // Bulk approve is specifically for new applications — not for reactivating
  // resigned/rejected members
  const validMembers = members.filter((m) => m.status === "awaiting_approval" || m.status === "awaiting_payment");

  if (validMembers.length === 0) {
    error(400, LL.admin.members.noMembersAwaitingApproval());
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "active" }).where(inArray(table.member.id, validIds));
  });

  await auditBulkMemberAction(event, "member.bulk_approve", validIds, {
    requestedCount: memberIds.length,
    processedCount: validIds.length,
  });

  // Send membership approved emails to all approved members
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const approvedMembersWithDetails = await db._query.member.findMany({
      where: inArray(table.member.id, validIds),
      with: {
        user: true,
        membership: {
          with: { membershipType: true },
        },
      },
    });

    // Send emails in parallel, don't fail if some emails fail
    const membersWithUsers = approvedMembersWithDetails.filter(
      (m): m is typeof m & { user: NonNullable<typeof m.user> } => m.user !== null,
    );
    const emailPromises = membersWithUsers.map(async (memberWithDetails) => {
      const userLocale = getUserLocale(memberWithDetails.user);

      return sendMemberEmail({
        recipientEmail: memberWithDetails.user.email,
        emailType: "membership_approved",
        metadata: {
          firstName: getDisplayFirstName(memberWithDetails.user),
          membershipName: getMembershipName(memberWithDetails.membership, userLocale),
          startDate: memberWithDetails.membership.startTime,
          endDate: memberWithDetails.membership.endTime,
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

  if (!event.locals.session || !userHasAdminWriteAccess(event.locals.user)) {
    error(404, LL.error.resourceNotFound());
  }

  // Fetch all members to validate they exist and can be deemed resigned
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const members = await db._query.member.findMany({
    where: inArray(table.member.id, memberIds),
  });

  const validMembers = members.filter((m) => isValidTransition(m.status, "resigned"));

  if (validMembers.length === 0) {
    error(400, LL.admin.members.noMembersCanBeResigned());
  }

  const validIds = validMembers.map((m) => m.id);

  // Use transaction to update all members atomically
  await db.transaction(async (tx) => {
    await tx.update(table.member).set({ status: "resigned" }).where(inArray(table.member.id, validIds));
  });

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
