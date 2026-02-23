import { test, expect } from "./fixtures/db";
import { route } from "../src/lib/ROUTES";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * E2E tests for association (yhteisö) member functionality.
 *
 * Tests the admin UI for:
 * - Creating association members via the "Add member" form
 * - Creating person members via the "Add member" form
 * - Viewing association members in the members table
 * - Non-purchasable membership types not appearing on the purchase page
 */

test.describe("Association members", () => {
  const createdMemberIds: string[] = [];
  const createdUserIds: string[] = [];

  test.afterEach(async ({ db }) => {
    // Clean up members created during tests
    for (const id of createdMemberIds) {
      await db.delete(table.member).where(eq(table.member.id, id));
    }
    createdMemberIds.length = 0;

    for (const id of createdUserIds) {
      await db.delete(table.user).where(eq(table.user.id, id));
    }
    createdUserIds.length = 0;
  });

  test("can create an association member via the admin form", async ({ adminPage, db }) => {
    const orgName = `Test Association ${crypto.randomUUID().slice(0, 8)} ry`;

    await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Open the "Add member" sheet
    await adminPage.getByRole("button", { name: "Lisää jäsen" }).click();

    // Switch to association mode
    await adminPage.getByTestId("member-type-association").click();

    // Fill in organization name
    await adminPage.getByLabel(/Yhdistyksen nimi/).fill(orgName);

    // Select a membership (pick the first one available)
    const membershipSelect = adminPage.locator("#create-member-membership");
    await membershipSelect.selectOption({ index: 1 });

    // Submit the form
    await adminPage.getByRole("button", { name: "Luo" }).click();

    // Wait for success toast
    await expect(adminPage.getByText("Jäsen lisätty onnistuneesti")).toBeVisible({ timeout: 10_000 });

    // Verify the member appears in the table
    await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), {
      waitUntil: "networkidle",
    });
    await adminPage.getByPlaceholder(/Hae/).fill(orgName.slice(0, 15));
    await expect(adminPage.getByText(orgName)).toBeVisible();

    // Track for cleanup
    const member = await db.query.member.findFirst({
      where: eq(table.member.organizationName, orgName),
    });
    if (member) createdMemberIds.push(member.id);
  });

  test("can create a person member via the admin form", async ({ adminPage, db }) => {
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const email = `test-person-${uniqueId}@example.com`;
    const firstNames = `TestFirst${uniqueId}`;
    const lastName = `TestLast${uniqueId}`;

    await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Open the "Add member" sheet
    await adminPage.getByRole("button", { name: "Lisää jäsen" }).click();

    // Person mode should be the default
    await expect(adminPage.getByLabel(/Sähköposti/)).toBeVisible();

    // Fill in person details
    await adminPage.getByLabel(/Sähköposti/).fill(email);
    await adminPage.getByLabel(/Etunimet/).fill(firstNames);
    await adminPage.getByLabel(/Sukunimi/).fill(lastName);

    // Select a membership
    const membershipSelect = adminPage.locator("#create-member-membership");
    await membershipSelect.selectOption({ index: 1 });

    // Submit
    await adminPage.getByRole("button", { name: "Luo" }).click();

    // Wait for success
    await expect(adminPage.getByText("Jäsen lisätty onnistuneesti")).toBeVisible({ timeout: 10_000 });

    // Verify the member appears in the table
    await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), {
      waitUntil: "networkidle",
    });
    await adminPage.getByPlaceholder(/Hae/).fill(firstNames);
    await expect(adminPage.getByText(firstNames)).toBeVisible();

    // Track for cleanup
    const user = await db.query.user.findFirst({
      where: eq(table.user.email, email),
    });
    if (user) {
      createdUserIds.push(user.id);
      const member = await db.query.member.findFirst({
        where: eq(table.member.userId, user.id),
      });
      if (member) createdMemberIds.push(member.id);
    }
  });

  test("association members appear in the members table with organization name", async ({ adminPage, db }) => {
    const orgName = `Visible Org ${crypto.randomUUID().slice(0, 8)} ry`;

    // Get any available membership
    const membership = await db.query.membership.findFirst();
    if (!membership) throw new Error("No membership found for test");

    // Create association member directly in DB
    const memberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: memberId,
      userId: null,
      organizationName: orgName,
      membershipId: membership.id,
      status: "active",
    });
    createdMemberIds.push(memberId);

    // Navigate to members page
    await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Search for the organization to find it (table has pagination)
    await adminPage.getByPlaceholder(/Hae/).fill(orgName.slice(0, 15));

    // The organization name should be visible in the table
    await expect(adminPage.getByText(orgName)).toBeVisible();
  });

  test("association members can be found via search", async ({ adminPage, db }) => {
    const orgName = `Searchable Guild ${crypto.randomUUID().slice(0, 8)} ry`;

    const membership = await db.query.membership.findFirst();
    if (!membership) throw new Error("No membership found for test");

    const memberId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: memberId,
      userId: null,
      organizationName: orgName,
      membershipId: membership.id,
      status: "active",
    });
    createdMemberIds.push(memberId);

    await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Search for the organization
    await adminPage.getByPlaceholder(/Hae/).fill(orgName.slice(0, 15));

    // Should still be visible after filtering
    await expect(adminPage.getByText(orgName)).toBeVisible();
  });
});

test.describe("Non-purchasable membership types", () => {
  let testMembershipTypeId: string;

  test.beforeEach(async ({ db }) => {
    // Create a non-purchasable membership type with a unique name
    testMembershipTypeId = `test-nonpurch-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(table.membershipType).values({
      id: testMembershipTypeId,
      name: { fi: `Ei-ostettava ${testMembershipTypeId}`, en: `Non-purchasable ${testMembershipTypeId}` },
      purchasable: false,
    });

    // Create a membership period for it
    await db.insert(table.membership).values({
      id: `membership-${testMembershipTypeId}`,
      membershipTypeId: testMembershipTypeId,
      startTime: new Date("2025-08-01"),
      endTime: new Date("2026-07-31"),
      requiresStudentVerification: false,
    });
  });

  test.afterEach(async ({ db }) => {
    await db.delete(table.membership).where(eq(table.membership.id, `membership-${testMembershipTypeId}`));
    await db.delete(table.membershipType).where(eq(table.membershipType.id, testMembershipTypeId));
  });

  test("non-purchasable membership types do not appear on the purchase page", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // The non-purchasable type should NOT be visible
    await expect(adminPage.getByText(`Ei-ostettava ${testMembershipTypeId}`)).not.toBeVisible();
  });
});
