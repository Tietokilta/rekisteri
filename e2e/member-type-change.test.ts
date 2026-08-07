import { test, expect } from "./fixtures/db";
import * as table from "$lib/server/db/schema";
import { and, eq } from "drizzle-orm";
import { generateUserId } from "../src/lib/server/auth/utils";

test.describe("Admin membership type correction", () => {
  const sourceMembershipId = crypto.randomUUID();
  const targetMembershipId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const userId = generateUserId();
  const email = `type-correction-${crypto.randomUUID()}@example.com`;

  test.beforeAll(async ({ db }) => {
    const startTime = new Date("2080-08-01T09:00:00.000Z");
    const endTime = new Date("2081-07-31T09:00:00.000Z");

    await db.insert(table.membership).values([
      {
        id: sourceMembershipId,
        membershipTypeId: "varsinainen-jasen",
        stripePriceId: "price_equal_for_type_correction_test",
        startTime,
        endTime,
        requiresStudentVerification: true,
      },
      {
        id: targetMembershipId,
        membershipTypeId: "ulkojasen",
        stripePriceId: "price_equal_for_type_correction_test",
        startTime,
        endTime,
        requiresStudentVerification: false,
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
      membershipId: sourceMembershipId,
      status: "awaiting_approval",
    });
  });

  test.afterAll(async ({ db }) => {
    await db
      .delete(table.auditLog)
      .where(and(eq(table.auditLog.action, "member.type_change"), eq(table.auditLog.targetId, memberId)));
    await db.delete(table.member).where(eq(table.member.id, memberId));
    await db.delete(table.user).where(eq(table.user.id, userId));
    await db.delete(table.membership).where(eq(table.membership.id, sourceMembershipId));
    await db.delete(table.membership).where(eq(table.membership.id, targetMembershipId));
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
    expect(updatedMember?.membershipId).toBe(targetMembershipId);

    const [auditLog] = await db
      .select()
      .from(table.auditLog)
      .where(and(eq(table.auditLog.action, "member.type_change"), eq(table.auditLog.targetId, memberId)));

    expect(auditLog?.userId).toBe(adminUser.id);
    expect(auditLog?.targetType).toBe("member");
    expect(auditLog?.metadata).toMatchObject({
      changeKind: "purchase_correction",
      previousMembershipId: sourceMembershipId,
      previousMembershipTypeId: "varsinainen-jasen",
      previousStripePriceId: "price_equal_for_type_correction_test",
      targetMembershipId,
      targetMembershipTypeId: "ulkojasen",
      targetStripePriceId: "price_equal_for_type_correction_test",
      previousStatus: "awaiting_approval",
    });
  });
});
