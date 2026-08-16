import { test, expect } from "./fixtures/db";
import * as table from "$lib/server/db/schema";
import { and, eq } from "drizzle-orm";
import { generateUserId } from "../src/lib/server/auth/utils";

test.describe("Admin membership type correction", () => {
  const sourceMembershipId = crypto.randomUUID();
  const targetMembershipId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const obligationId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();
  const applicationEventId = crypto.randomUUID();
  const userId = generateUserId();
  const email = `type-correction-${crypto.randomUUID()}@example.com`;

  test.beforeAll(async ({ db }) => {
    await db.insert(table.membershipFeePeriod).values([
      {
        id: sourceMembershipId,
        membershipTypeId: "varsinainen-jasen",
        stripePriceId: "price_equal_for_type_correction_test",
        startDate: "2080-08-01",
        endDate: "2081-07-31",
        dueDate: "2080-09-30",
        nonPaymentActionAt: "2080-12-01",
      },
      {
        id: targetMembershipId,
        membershipTypeId: "ulkojasen",
        stripePriceId: "price_equal_for_type_correction_test",
        startDate: "2080-08-01",
        endDate: "2081-07-31",
        dueDate: "2080-09-30",
        nonPaymentActionAt: "2080-12-01",
      },
    ]);

    await db.insert(table.user).values({
      id: userId,
      email,
      firstNames: "Type",
      lastName: "Correction",
      homeMunicipality: "Espoo",
    });

    await db.insert(table.member).values({
      id: memberId,
      userId,
      status: "awaiting_approval",
      pendingMembershipTypeId: "varsinainen-jasen",
    });
    await db.insert(table.membershipObligation).values({
      id: obligationId,
      memberId,
      membershipFeePeriodId: sourceMembershipId,
      kind: "application",
    });
    await db.insert(table.payment).values({
      id: paymentId,
      memberId,
      membershipFeePeriodId: sourceMembershipId,
      obligationId,
      source: "stripe",
      status: "succeeded",
      amount: 800,
      currency: "eur",
      paidAt: new Date(),
    });
    await db.insert(table.membershipEvent).values({
      id: applicationEventId,
      memberId,
      eventType: "application_submitted",
      effectiveAt: new Date(),
      source: "system",
      certainty: "confirmed",
      membershipFeePeriodId: sourceMembershipId,
      data: { membershipTypeId: "varsinainen-jasen" },
    });
  });

  test.afterAll(async ({ db }) => {
    await db
      .delete(table.auditLog)
      .where(and(eq(table.auditLog.action, "member.type_change"), eq(table.auditLog.targetId, memberId)));
    await db.delete(table.membershipEvent).where(eq(table.membershipEvent.memberId, memberId));
    await db.delete(table.payment).where(eq(table.payment.memberId, memberId));
    await db.delete(table.membershipObligation).where(eq(table.membershipObligation.memberId, memberId));
    await db.delete(table.member).where(eq(table.member.id, memberId));
    await db.delete(table.user).where(eq(table.user.id, userId));
    await db.delete(table.membershipFeePeriod).where(eq(table.membershipFeePeriod.id, sourceMembershipId));
    await db.delete(table.membershipFeePeriod).where(eq(table.membershipFeePeriod.id, targetMembershipId));
  });

  test("corrects an equal-priced membership and writes migration-ready audit metadata", async ({
    adminPage,
    adminUser,
    db,
  }) => {
    await adminPage.goto("/fi/admin/members");
    await adminPage.getByPlaceholder("Hae jäseniä").fill(email);

    const memberRow = adminPage.getByRole("row").filter({ hasText: email });
    await expect(memberRow).toBeVisible();
    await memberRow.getByRole("button").click();

    await adminPage.getByTestId(`change-membership-type-${memberId}`).click();
    await expect(adminPage.getByRole("heading", { name: "Korjaa jäsenyysluokka" })).toBeVisible();
    await adminPage.getByLabel("Uusi jäsenyysluokka").selectOption(targetMembershipId);
    await adminPage.getByTestId("confirm-membership-type-change").click();

    await expect(adminPage.getByText("Jäsenyysluokka korjattu")).toBeVisible();

    const [updatedMember] = await db.select().from(table.member).where(eq(table.member.id, memberId));
    expect(updatedMember).toMatchObject({
      status: "awaiting_approval",
      pendingMembershipTypeId: "ulkojasen",
    });
    const [updatedPayment] = await db.select().from(table.payment).where(eq(table.payment.id, paymentId));
    expect(updatedPayment?.membershipFeePeriodId).toBe(targetMembershipId);

    const correctionEvent = await db.query.membershipEvent.findFirst({
      where: { memberId, eventType: "membership_decision_corrected" },
    });
    expect(correctionEvent).toMatchObject({
      actorUserId: adminUser.id,
      relatedEventId: applicationEventId,
      membershipFeePeriodId: targetMembershipId,
    });

    const [auditLog] = await db
      .select()
      .from(table.auditLog)
      .where(and(eq(table.auditLog.action, "member.type_change"), eq(table.auditLog.targetId, memberId)));

    expect(auditLog?.userId).toBe(adminUser.id);
    expect(auditLog?.targetType).toBe("member");
    expect(auditLog?.metadata).toMatchObject({
      changeKind: "purchase_correction",
      previousFeePeriodId: sourceMembershipId,
      previousMembershipTypeId: "varsinainen-jasen",
      previousStripePriceId: "price_equal_for_type_correction_test",
      targetFeePeriodId: targetMembershipId,
      targetMembershipTypeId: "ulkojasen",
      targetStripePriceId: "price_equal_for_type_correction_test",
      previousStatus: "awaiting_approval",
      model: "indefinite_membership",
    });
  });
});
