import { test, expect } from "./fixtures/isolated-user";
import * as table from "../src/lib/server/db/schema";
import { route } from "../src/lib/ROUTES";

// Use existing membership type from seed data
const membershipTypeId = "ulkojasen"; // External member - no student verification required

// Real Stripe test price ID from seed data - this is required because the page
// fetches price metadata from Stripe API, and fake price IDs will fail
const realStripePriceId = "price_1Sqs7y2a3B4f6jfhHjnWzk9n";

test.describe("Membership Overlap Blocking", () => {
  test("shows membership when user has no blocking memberships for that period", async ({ isolatedPage, db }) => {
    // Create a test membership for a far future period
    const testMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: testMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2050, 7, 1),
      endTime: new Date(2051, 6, 31),
      requiresStudentVerification: false,
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // Verify the membership is shown (date format: d.M.yyyy in Finnish)
    await expect(isolatedPage.getByText(/1\.8\.2050/)).toBeVisible();
  });

  test("hides membership when user has active membership for same period", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Create a test membership
    const testMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: testMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2051, 7, 1),
      endTime: new Date(2052, 6, 31),
      requiresStudentVerification: false,
    });

    // Create an active member record for the test user
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: testMembershipId,
      status: "active",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // Verify the membership is NOT shown (blocked by active membership)
    await expect(isolatedPage.getByText(/1\.8\.2051/)).not.toBeVisible();
  });

  test("shows membership when user has cancelled membership for same period", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Create a test membership
    const testMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: testMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2052, 7, 1),
      endTime: new Date(2053, 6, 31),
      requiresStudentVerification: false,
    });

    // Create a cancelled member record for the test user
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: testMembershipId,
      status: "cancelled",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // Verify the membership IS shown (cancelled memberships don't block)
    await expect(isolatedPage.getByText(/1\.8\.2052/)).toBeVisible();
  });

  test("shows membership when user has expired membership for same period", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Create a test membership
    const testMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: testMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2053, 7, 1),
      endTime: new Date(2054, 6, 31),
      requiresStudentVerification: false,
    });

    // Create an expired member record for the test user
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: testMembershipId,
      status: "expired",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // Verify the membership IS shown (expired memberships don't block)
    await expect(isolatedPage.getByText(/1\.8\.2053/)).toBeVisible();
  });

  test("hides membership when user has awaiting_payment membership for same period", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Create a test membership
    const testMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: testMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2054, 7, 1),
      endTime: new Date(2055, 6, 31),
      requiresStudentVerification: false,
    });

    // Create an awaiting_payment member record for the test user
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: testMembershipId,
      status: "awaiting_payment",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // Verify the membership is NOT shown (awaiting_payment blocks)
    await expect(isolatedPage.getByText(/1\.8\.2054/)).not.toBeVisible();
  });

  test("hides membership when user has awaiting_approval membership for same period", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Create a test membership
    const testMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: testMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2055, 7, 1),
      endTime: new Date(2056, 6, 31),
      requiresStudentVerification: false,
    });

    // Create an awaiting_approval member record for the test user
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: testMembershipId,
      status: "awaiting_approval",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // Verify the membership is NOT shown (awaiting_approval blocks)
    await expect(isolatedPage.getByText(/1\.8\.2055/)).not.toBeVisible();
  });

  test("blocks future memberships when user has active membership ending later", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Create current membership (2070-2072) - user has this active
    const currentMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: currentMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2070, 7, 1),
      endTime: new Date(2072, 6, 31), // Ends in July 2072
      requiresStudentVerification: false,
    });

    // Future membership (2071-2072) - starts before current ends
    await db.insert(table.membership).values({
      id: crypto.randomUUID(),
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2071, 7, 1), // Starts August 2071, before July 2072 end
      endTime: new Date(2072, 6, 31),
      requiresStudentVerification: false,
    });

    // Create an active member record for the current membership
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: currentMembershipId,
      status: "active",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // The future membership (2071-2072) should be blocked because its start time
    // is before the active membership's end time (July 2072)
    await expect(isolatedPage.getByText(/1\.8\.2071/)).not.toBeVisible();
  });

  test("allows future memberships when they start after active membership ends", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Current membership (2080-2081)
    const currentMembershipId = crypto.randomUUID();
    await db.insert(table.membership).values({
      id: currentMembershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2080, 7, 1),
      endTime: new Date(2081, 6, 31), // Ends July 2081
      requiresStudentVerification: false,
    });

    // Future membership (2081-2082) - starts exactly when current ends
    await db.insert(table.membership).values({
      id: crypto.randomUUID(),
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2081, 7, 1), // Starts August 2081, after July 2081 end
      endTime: new Date(2082, 6, 31),
      requiresStudentVerification: false,
    });

    // Create an active member record for the current membership
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: currentMembershipId,
      status: "active",
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
    await isolatedPage.waitForLoadState("networkidle");

    // The future membership (2081-2082) should be available because it starts
    // on or after the active membership ends
    await expect(isolatedPage.getByText(/1\.8\.2081/)).toBeVisible();
  });
});
