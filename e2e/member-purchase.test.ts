import { test, expect } from "./fixtures/db";
import * as table from "$lib/server/db/schema";
import type { Schema } from "../src/lib/server/db";
import { and, eq, gte, isNotNull, inArray } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Page } from "@playwright/test";

test.describe("Member Purchase Flow", () => {
  // Track test members for cleanup
  let testMemberIds: string[] = [];

  test.beforeEach(async ({ db, adminUser }) => {
    // Ensure admin user has a complete profile (required for /new page)
    // Use .returning() to verify the update actually worked
    const result = await db
      .update(table.user)
      .set({
        firstNames: "Test",
        lastName: "Admin",
        homeMunicipality: "Espoo",
      })
      .where(eq(table.user.id, adminUser.id))
      .returning({ id: table.user.id });

    if (result.length === 0) {
      throw new Error(
        `beforeEach: Failed to update user profile. User ${adminUser.id} not found in database. ` +
          `This usually means the global-setup did not seed the database correctly.`,
      );
    }
  });

  test.afterEach(async ({ db }) => {
    if (testMemberIds.length > 0) {
      await db.delete(table.payment).where(inArray(table.payment.memberId, testMemberIds));
      await db.delete(table.membershipEvent).where(inArray(table.membershipEvent.memberId, testMemberIds));
      await db.delete(table.membershipObligation).where(inArray(table.membershipObligation.memberId, testMemberIds));
      await db.delete(table.member).where(inArray(table.member.id, testMemberIds));
    }
    testMemberIds = [];
  });

  // Helper to get a membership with Stripe price ID
  async function getMembershipWithStripePrice(db: PostgresJsDatabase<Schema>) {
    const [membership] = await db
      .select()
      .from(table.membershipFeePeriod)
      .where(
        and(
          isNotNull(table.membershipFeePeriod.stripePriceId),
          eq(table.membershipFeePeriod.acceptsApplications, true),
          gte(table.membershipFeePeriod.endDate, new Date().toISOString().slice(0, 10)),
        ),
      )
      .limit(1);
    if (!membership) throw new Error("No membership with Stripe price found");
    return membership;
  }

  // Helper to navigate to /new and verify the membership form is visible
  // Fails with a clear error if ProfileIncompleteCard is shown instead
  async function gotoNewMembershipPage(page: Page) {
    await page.goto(route("/[locale=locale]/new", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Check if ProfileIncompleteCard is visible (indicates profile is incomplete)
    const profileIncomplete = page.getByText("Täydennä profiilisi");
    const isProfileIncomplete = await profileIncomplete.isVisible();

    if (isProfileIncomplete) {
      throw new Error(
        "ProfileIncompleteCard is visible - the user profile is incomplete. " +
          "The beforeEach hook should have set firstNames, lastName, and homeMunicipality. " +
          "This indicates a database sync issue between the test and the server.",
      );
    }

    // Wait for the membership purchase button to be visible (more reliable than form element)
    await expect(page.getByRole("button", { name: "Osta jäsenyys" })).toBeVisible();
  }

  test("shows 'Complete Payment' button for awaiting_payment status", async ({ adminPage, adminUser, db }) => {
    const membership = await getMembershipWithStripePrice(db);

    // Create an awaiting_payment member for the test user
    const testMemberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: testMemberId,
      userId: adminUser.id,
      status: "awaiting_payment",
      pendingMembershipTypeId: membership.membershipTypeId,
    });
    const obligationId = crypto.randomUUID();
    await db.insert(table.membershipObligation).values({
      id: obligationId,
      memberId: testMemberId,
      membershipFeePeriodId: membership.id,
      kind: "application",
    });
    await db.insert(table.payment).values({
      id: crypto.randomUUID(),
      memberId: testMemberId,
      membershipFeePeriodId: membership.id,
      obligationId,
      source: "stripe",
      status: "pending",
      stripeSessionId: `test_session_${testMemberId}`,
    });
    testMemberIds.push(testMemberId);

    // Navigate to home page
    await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Verify the "Complete Payment" / "Jatka maksua" button is visible
    await expect(adminPage.getByRole("button", { name: "Jatka maksua" })).toBeVisible();

    // Verify the "New" button is NOT visible when awaiting_payment
    await expect(adminPage.getByRole("link", { name: /Osta uusi|Uusi jäsenyys|Hanki jäsenyys/i })).not.toBeVisible();
  });

  test("allows repurchasing rejected membership", async ({ adminPage, adminUser, db }) => {
    // Create a rejected member for the test user
    const testMemberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: testMemberId,
      userId: adminUser.id,
      status: "rejected",
    });
    testMemberIds.push(testMemberId);

    // Navigate to new membership page and verify form is visible
    await gotoNewMembershipPage(adminPage);

    // The rejected membership should be available to repurchase
    // Look for a radio button for that membership type
    const membershipRadio = adminPage.getByRole("radio");
    await expect(membershipRadio.first()).toBeVisible();
  });

  test("allows reapplying after membership has ended", async ({ adminPage, adminUser, db }) => {
    const membership = await getMembershipWithStripePrice(db);

    // The legal membership identity remains, but its active interval has ended.
    const testMemberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: testMemberId,
      userId: adminUser.id,
      status: "ended",
      membershipTypeId: membership.membershipTypeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      currentMembershipEndedAt: new Date("2026-01-15T00:00:00Z"),
    });
    testMemberIds.push(testMemberId);

    // Navigate to new membership page and verify form is visible
    await gotoNewMembershipPage(adminPage);

    // The resigned membership should be available to repurchase
    const membershipRadio = adminPage.getByRole("radio");
    await expect(membershipRadio.first()).toBeVisible();
  });

  test("offers the current fee target as a renewal to an active member", async ({ adminPage, adminUser, db }) => {
    const membership = await getMembershipWithStripePrice(db);

    // Create an active member for the test user
    const testMemberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: testMemberId,
      userId: adminUser.id,
      status: "active",
      membershipTypeId: membership.membershipTypeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
    });
    testMemberIds.push(testMemberId);

    // Navigate to new membership page and verify form is visible
    await gotoNewMembershipPage(adminPage);

    // Legal membership remains active while the next fee can still be paid.
    const activeRadio = adminPage.locator(`input[type="radio"][value="${membership.id}"]`);
    await expect(activeRadio).toBeVisible();
  });

  test("shows status badge correctly on home page", async ({ adminPage, adminUser, db }) => {
    const membership = await getMembershipWithStripePrice(db);

    // Create an awaiting_approval member
    const testMemberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: testMemberId,
      userId: adminUser.id,
      status: "awaiting_approval",
      pendingMembershipTypeId: membership.membershipTypeId,
    });
    testMemberIds.push(testMemberId);

    // Navigate to home page
    await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Verify the awaiting approval badge/status is visible
    await expect(adminPage.getByText("Odottaa hyväksyntää")).toBeVisible();
  });

  test("home page shows 'Renew membership' after membership has ended", async ({ adminPage, adminUser, db }) => {
    const membership = await getMembershipWithStripePrice(db);

    // Create an ended stable membership for the test user.
    const testMemberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: testMemberId,
      userId: adminUser.id,
      status: "ended",
      membershipTypeId: membership.membershipTypeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      currentMembershipEndedAt: new Date("2026-01-15T00:00:00Z"),
    });
    testMemberIds.push(testMemberId);

    // Navigate to home page
    await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Verify the "Renew membership" / "Uusi jäsenyys" button is visible
    await expect(adminPage.getByRole("link", { name: "Uusi jäsenyys" })).toBeVisible();
  });
});
