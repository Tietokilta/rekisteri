import { test, expect } from "./fixtures/db";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "$lib/server/db/schema";
import type { relations } from "$lib/server/db/relations";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { generateUserId } from "../src/lib/server/auth/utils";

test.describe("Admin Bulk Actions", () => {
  let db: PostgresJsDatabase<typeof relations>;

  test.beforeAll(async ({ db: fixtureDb }) => {
    db = fixtureDb;
  });

  async function deleteMembers(memberIds: string[]) {
    if (memberIds.length === 0) return;
    await db.delete(table.payment).where(inArray(table.payment.memberId, memberIds));
    await db.delete(table.membershipEvent).where(inArray(table.membershipEvent.memberId, memberIds));
    await db.delete(table.membershipObligation).where(inArray(table.membershipObligation.memberId, memberIds));
    await db.delete(table.member).where(inArray(table.member.id, memberIds));
  }

  async function createAwaitingApprovalMember(
    memberId: string,
    userId: string,
    membershipId: string,
    membershipTypeId: string,
    settled = true,
  ) {
    const obligationId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: memberId,
      userId,
      status: "awaiting_approval",
      pendingMembershipTypeId: membershipTypeId,
    });
    await db.insert(table.membershipObligation).values({
      id: obligationId,
      memberId,
      membershipFeePeriodId: membershipId,
      kind: "application",
    });
    if (settled) {
      await db.insert(table.payment).values({
        id: crypto.randomUUID(),
        memberId,
        membershipFeePeriodId: membershipId,
        obligationId,
        source: "stripe",
        status: "succeeded",
        amount: 800,
        currency: "eur",
        paidAt: new Date(),
      });
    }
    await db.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId,
      eventType: "application_submitted",
      effectiveAt: new Date(),
      source: "system",
      certainty: "confirmed",
      membershipFeePeriodId: membershipId,
      data: { membershipTypeId },
    });
  }

  test.describe("Selection and Toolbar", () => {
    test("checkbox column is visible and select all works", async ({ adminPage }) => {
      await adminPage.goto("/fi/admin/members");

      // Wait for page to load
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Check that select all checkbox exists
      const selectAllCheckbox = adminPage.getByTestId("select-all-checkbox");
      await expect(selectAllCheckbox).toBeVisible();

      // Check that row checkboxes exist
      const rowCheckboxes = adminPage.getByTestId("row-select-checkbox");
      await expect(rowCheckboxes.first()).toBeVisible();

      // Initially no toolbar should be visible
      await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

      // Click select all
      await selectAllCheckbox.click();

      // Toolbar should now be visible
      await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();
    });

    test("selecting individual rows shows toolbar", async ({ adminPage }) => {
      await adminPage.goto("/fi/admin/members");

      // Wait for page to load
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Initially no toolbar
      await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

      // Select first row
      const firstRowCheckbox = adminPage.getByTestId("row-select-checkbox").first();
      await firstRowCheckbox.click();

      // Toolbar should appear
      await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();

      // Should show "1 valittu" (1 selected)
      await expect(adminPage.getByTestId("bulk-action-toolbar")).toContainText("1 valittu");
    });

    test("clear selection button works", async ({ adminPage }) => {
      await adminPage.goto("/fi/admin/members");

      // Wait for page to load
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Select first row
      const firstRowCheckbox = adminPage.getByTestId("row-select-checkbox").first();
      await firstRowCheckbox.click();

      // Toolbar should appear
      await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();

      // Click clear selection
      await adminPage.getByRole("button", { name: "Tyhjennä valinta" }).click();

      // Toolbar should disappear
      await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();
    });
  });

  test.describe("Bulk Approve Members", () => {
    let testUsers: Array<{ id: string; email: string }>;
    let membershipId: string;
    let memberIds: string[];

    test.beforeAll(async () => {
      const uniqueId = crypto.randomUUID();

      // Create test users
      testUsers = [
        { id: generateUserId(), email: `bulk-approve-1-${uniqueId}@example.com` },
        { id: generateUserId(), email: `bulk-approve-2-${uniqueId}@example.com` },
        { id: generateUserId(), email: `bulk-approve-3-${uniqueId}@example.com` },
      ];

      await db.insert(table.user).values(
        testUsers.map((u) => ({
          id: u.id,
          email: u.email,
          firstNames: "Bulk Test",
          lastName: "User",
          homeMunicipality: "Helsinki",
          adminRole: "none" as const,
        })),
      );

      // Get a membership
      const [membership] = await db
        .select()
        .from(table.membershipFeePeriod)
        .where(
          and(
            eq(table.membershipFeePeriod.membershipTypeId, "varsinainen-jasen"),
            isNotNull(table.membershipFeePeriod.stripePriceId),
          ),
        )
        .limit(1);
      if (!membership) throw new Error("Membership not found");
      membershipId = membership.id;

      // Create members with awaiting_approval status
      memberIds = testUsers.map(() => generateUserId());
      for (const [index, user] of testUsers.entries()) {
        const id = memberIds[index];
        if (!id) throw new Error("Member ID not found");
        await createAwaitingApprovalMember(id, user.id, membershipId, membership.membershipTypeId);
      }
    });

    test.afterAll(async () => {
      // Clean up
      await deleteMembers(memberIds);
      for (const u of testUsers) {
        await db.delete(table.user).where(eq(table.user.id, u.id));
      }
    });

    test("bulk approve action approves all selected members", async ({ adminPage }) => {
      await adminPage.goto("/fi/admin/members");

      // Wait for page to load
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Filter by awaiting approval status
      await adminPage.getByRole("button", { name: "Odottaa hyväksyntää" }).click();

      // Search for our test users
      await adminPage.getByPlaceholder("Hae jäseniä").fill("bulk-approve");

      // Wait for filtered results - all 3 should be visible
      const firstTestUser = testUsers[0];
      const secondTestUser = testUsers[1];
      const thirdTestUser = testUsers[2];
      if (!firstTestUser || !secondTestUser || !thirdTestUser) throw new Error("Test user not found");
      await expect(adminPage.getByText(firstTestUser.email)).toBeVisible();
      await expect(adminPage.getByText(secondTestUser.email)).toBeVisible();
      await expect(adminPage.getByText(thirdTestUser.email)).toBeVisible();

      // Select all filtered rows
      const selectAllCheckbox = adminPage.getByTestId("select-all-checkbox");
      await selectAllCheckbox.click();

      // Toolbar should appear with approve button
      const toolbar = adminPage.getByTestId("bulk-action-toolbar");
      await expect(toolbar).toBeVisible();
      await expect(adminPage.getByTestId("bulk-approve-button")).toBeVisible();

      // Click bulk approve
      await adminPage.getByTestId("bulk-approve-button").click();

      // Confirm the dialog
      await adminPage.getByRole("button", { name: "Vahvista" }).click();

      // Wait for toolbar to disappear (indicates action completed)
      await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

      // Verify via UI: members should no longer appear in "awaiting approval" filter
      // (they are now active, so they won't match the current filter)
      await expect(adminPage.getByText(firstTestUser.email)).not.toBeVisible();
      await expect(adminPage.getByText(secondTestUser.email)).not.toBeVisible();
      await expect(adminPage.getByText(thirdTestUser.email)).not.toBeVisible();

      // Additionally verify they appear in the "active" filter
      await adminPage.getByRole("button", { name: "Aktiivinen" }).click();
      await adminPage.getByPlaceholder("Hae jäseniä").fill("bulk-approve");
      await expect(adminPage.getByText(firstTestUser.email)).toBeVisible();
      await expect(adminPage.getByText(secondTestUser.email)).toBeVisible();
      await expect(adminPage.getByText(thirdTestUser.email)).toBeVisible();
    });
  });

  test.describe("Bulk Actions Based on Status", () => {
    let testUser: { id: string; email: string };
    let memberId: string;

    test.beforeEach(async () => {
      const uniqueId = crypto.randomUUID();

      testUser = { id: generateUserId(), email: `bulk-status-${uniqueId}@example.com` };

      await db.insert(table.user).values({
        id: testUser.id,
        email: testUser.email,
        firstNames: "Status Test",
        lastName: "User",
        homeMunicipality: "Helsinki",
        adminRole: "none" as const,
      });

      memberId = generateUserId();
    });

    test.afterEach(async () => {
      await deleteMembers([memberId]);
      await db.delete(table.user).where(eq(table.user.id, testUser.id));
    });

    test("shows approve button for awaiting_approval members", async ({ adminPage }) => {
      // Create member with awaiting_approval status
      await db.insert(table.member).values({
        id: memberId,
        userId: testUser.id,
        status: "awaiting_approval",
        pendingMembershipTypeId: "varsinainen-jasen",
      });

      await adminPage.goto("/fi/admin/members");
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible({ timeout: 10_000 });

      // Filter by awaiting approval
      await adminPage.getByRole("button", { name: "Odottaa hyväksyntää" }).click();
      await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
      await expect(adminPage.getByText(testUser.email)).toBeVisible();

      // Select the row
      await adminPage.getByTestId("row-select-checkbox").first().click();

      // Should see approve button
      await expect(adminPage.getByTestId("bulk-approve-button")).toBeVisible();

      // Should NOT see deem resigned button (member is awaiting approval, not active)
      await expect(adminPage.getByTestId("bulk-deem-resigned-button")).not.toBeVisible();
    });

    test("deems an active member resigned for an actionable unpaid obligation", async ({ adminPage }) => {
      // Create member with active status
      await db.insert(table.member).values({
        id: memberId,
        userId: testUser.id,
        status: "active",
        membershipTypeId: "varsinainen-jasen",
        currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      });
      const overduePeriod = await db.query.membershipFeePeriod.findFirst({
        where: { membershipTypeId: "varsinainen-jasen", nonPaymentActionAt: { lt: "2026-08-16" } },
      });
      if (!overduePeriod) throw new Error("Overdue fee period not found");
      await db.insert(table.membershipObligation).values({
        id: crypto.randomUUID(),
        memberId,
        membershipFeePeriodId: overduePeriod.id,
        kind: "renewal",
      });

      await adminPage.goto("/fi/admin/members");
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Filter by active
      await adminPage.getByRole("button", { name: "Aktiivinen" }).click();
      await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
      await expect(adminPage.getByText(testUser.email)).toBeVisible();

      // Select the row
      await adminPage.getByTestId("row-select-checkbox").first().click();

      // Should see deem resigned button
      await expect(adminPage.getByTestId("bulk-deem-resigned-button")).toBeVisible();

      // Should NOT see approve button
      await expect(adminPage.getByTestId("bulk-approve-button")).not.toBeVisible();

      await adminPage.getByTestId("bulk-deem-resigned-button").click();
      await adminPage.getByRole("button", { name: "Vahvista" }).click();

      await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();
      const endedMember = await db.query.member.findFirst({ where: { id: memberId } });
      expect(endedMember?.status).toBe("ended");
      const endingEvent = await db.query.membershipEvent.findFirst({
        where: { memberId, eventType: "deemed_resigned_nonpayment" },
      });
      expect(endingEvent).toBeDefined();
    });

    test("no bulk actions for ended members", async ({ adminPage }) => {
      // Create a member whose legal membership has ended.
      await db.insert(table.member).values({
        id: memberId,
        userId: testUser.id,
        status: "ended",
        membershipTypeId: "varsinainen-jasen",
        currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
        currentMembershipEndedAt: new Date("2026-01-15T00:00:00Z"),
      });

      await adminPage.goto("/fi/admin/members");
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Filter by resigned
      await adminPage.getByRole("button", { name: "Eronnut" }).click();
      await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
      await expect(adminPage.getByText(testUser.email)).toBeVisible();

      // Select the row
      await adminPage.getByTestId("row-select-checkbox").first().click();

      // Should see toolbar but no action buttons (only clear selection)
      await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();
      await expect(adminPage.getByTestId("bulk-approve-button")).not.toBeVisible();
      await expect(adminPage.getByTestId("bulk-deem-resigned-button")).not.toBeVisible();
    });
  });

  test.describe("Mixed Status Selection", () => {
    let testUsers: Array<{ id: string; email: string }>;
    let membershipId: string;
    let memberIds: string[];

    test.beforeAll(async () => {
      const uniqueId = crypto.randomUUID();

      // Create test users with different statuses
      testUsers = [
        { id: generateUserId(), email: `bulk-mixed-1-${uniqueId}@example.com` },
        { id: generateUserId(), email: `bulk-mixed-2-${uniqueId}@example.com` },
      ];

      await db.insert(table.user).values(
        testUsers.map((u) => ({
          id: u.id,
          email: u.email,
          firstNames: "Mixed Test",
          lastName: "User",
          homeMunicipality: "Helsinki",
          adminRole: "none" as const,
        })),
      );

      // Get a membership
      const [membership] = await db
        .select()
        .from(table.membershipFeePeriod)
        .where(
          and(
            eq(table.membershipFeePeriod.membershipTypeId, "varsinainen-jasen"),
            lt(table.membershipFeePeriod.nonPaymentActionAt, "2026-08-16"),
          ),
        )
        .limit(1);
      if (!membership) throw new Error("Membership not found");
      membershipId = membership.id;

      memberIds = [generateUserId(), generateUserId()];

      // Create one active member and one awaiting_approval member
      const [memberId0, memberId1] = memberIds;
      const [user0, user1] = testUsers;
      if (!memberId0 || !memberId1 || !user0 || !user1) throw new Error("Test data not found");
      await db.insert(table.member).values({
        id: memberId0,
        userId: user0.id,
        status: "active",
        membershipTypeId: "varsinainen-jasen",
        currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      });
      await db.insert(table.membershipObligation).values({
        id: crypto.randomUUID(),
        memberId: memberId0,
        membershipFeePeriodId: membershipId,
        kind: "renewal",
      });
      await createAwaitingApprovalMember(memberId1, user1.id, membershipId, "varsinainen-jasen", false);
    });

    test.afterAll(async () => {
      await deleteMembers(memberIds);
      for (const u of testUsers) {
        await db.delete(table.user).where(eq(table.user.id, u.id));
      }
    });

    test("shows appropriate buttons for mixed status selection", async ({ adminPage }) => {
      await adminPage.goto("/fi/admin/members");
      await expect(adminPage.getByRole("heading", { name: "Jäsenrekisteri" })).toBeVisible();

      // Search for our test users
      await adminPage.getByPlaceholder("Hae jäseniä").fill("bulk-mixed");

      // Wait for results
      const user0 = testUsers[0];
      const user1 = testUsers[1];
      if (!user0 || !user1) throw new Error("Test users not found");
      await expect(adminPage.getByText(user0.email)).toBeVisible();
      await expect(adminPage.getByText(user1.email)).toBeVisible();

      // Select all
      await adminPage.getByTestId("select-all-checkbox").click();

      // Toolbar should show buttons for both status types
      // Approve button (for awaiting_approval)
      await expect(adminPage.getByTestId("bulk-approve-button")).toBeVisible();
      // Deem resigned button (for active)
      await expect(adminPage.getByTestId("bulk-deem-resigned-button")).toBeVisible();
    });
  });
});
