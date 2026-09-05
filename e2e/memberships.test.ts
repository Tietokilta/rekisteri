import { test, expect } from "./fixtures/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { relations } from "../src/lib/server/db/relations";
import { route } from "../src/lib/ROUTES";

async function createDraftPeriod(
  db: PostgresJsDatabase<typeof relations>,
  id: string,
  membershipTypeId: string,
  startDate: string,
  endDate: string,
) {
  await db.insert(table.membershipFeePeriod).values({
    id,
    membershipTypeId,
    startDate,
    endDate,
    dueDate: `${startDate.slice(0, 4)}-09-30`,
    nonPaymentActionAt: `${startDate.slice(0, 4)}-12-01`,
  });
}

test.describe("Memberships Admin", () => {
  // Track test memberships for cleanup
  let testMembershipIds: string[] = [];

  // Use existing membership type IDs from seed data
  const membershipTypeId = "varsinainen-jasen";
  const alternateMembershipTypeId = "ulkojasen";

  test.afterEach(async ({ db }) => {
    // Clean up test memberships
    for (const id of testMembershipIds) {
      await db.delete(table.membershipFeePeriod).where(eq(table.membershipFeePeriod.id, id));
    }
    testMembershipIds = [];
  });

  test("displays memberships page with existing data", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Verify page title is visible
    await expect(adminPage.getByRole("heading", { name: "Jäsenyyskaudet" })).toBeVisible();

    // Verify create button exists
    await expect(adminPage.getByRole("button", { name: "Luo uusi jäsenyys" })).toBeVisible();

    // Verify memberships are grouped by year (there should be at least one year heading)
    await expect(adminPage.getByRole("heading", { level: 2 }).first()).toBeVisible();
  });

  test("opens create membership sheet", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click create button
    await adminPage.getByRole("button", { name: "Luo uusi jäsenyys" }).click();

    // Verify sheet opens with form fields
    await expect(adminPage.getByLabel("Tyyppi")).toBeVisible();
    await expect(adminPage.getByLabel("Stripe hintakoodi")).toBeVisible();
    await expect(adminPage.getByLabel("Alkamisaika")).toBeVisible();
    await expect(adminPage.getByLabel("Päättymisaika")).toBeVisible();
  });

  test("opens edit sheet when clicking a membership", async ({ adminPage, db }) => {
    // Create a test membership with a unique date range to identify it
    const testMembershipId = crypto.randomUUID();

    await createDraftPeriod(db, testMembershipId, membershipTypeId, "2030-08-01", "2031-07-31");
    testMembershipIds.push(testMembershipId);

    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click the test membership (date display shows end year: 31.7.2031)
    await adminPage
      .getByRole("button", { name: /Varsinainen jäsen.*2031/ })
      .first()
      .click();

    // Verify edit sheet opens
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

    // Verify form fields are present
    await expect(adminPage.getByLabel("Tyyppi")).toBeVisible();
  });

  test("edit form is pre-populated with membership data", async ({ adminPage, db }) => {
    // Create a test membership with known values
    const testMembershipId = crypto.randomUUID();

    await createDraftPeriod(db, testMembershipId, alternateMembershipTypeId, "2031-08-01", "2032-07-31");
    testMembershipIds.push(testMembershipId);

    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click our test membership (date display shows end year: 31.7.2032)
    await adminPage
      .getByRole("button", { name: /Ulkojäsen.*2032/ })
      .first()
      .click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

    // Verify the type dropdown has ulkojasen selected
    await expect(adminPage.getByLabel("Tyyppi")).toHaveValue(alternateMembershipTypeId);
  });

  test("can update membership type", async ({ adminPage, db }) => {
    // Create a test membership to edit
    const testMembershipId = crypto.randomUUID();

    await createDraftPeriod(db, testMembershipId, membershipTypeId, "2032-08-01", "2033-07-31");
    testMembershipIds.push(testMembershipId);

    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Find and click our test membership (date display shows end year: 31.7.2033)
    await adminPage
      .getByRole("button", { name: /Varsinainen jäsen.*2033/ })
      .first()
      .click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

    // Change the type via the dropdown
    const typeSelect = adminPage.getByLabel("Tyyppi");
    await typeSelect.selectOption(alternateMembershipTypeId);

    // Submit the form
    await adminPage.getByRole("button", { name: "Tallenna" }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

    // Verify the new type appears in the UI (date display shows end year: 31.7.2033)
    await expect(adminPage.getByRole("button", { name: /Ulkojäsen.*2033/ }).first()).toBeVisible();
  });

  test("can delete membership with no members", async ({ adminPage, db }) => {
    // Create a test membership with no members using a unique far-future year
    const testMembershipId = crypto.randomUUID();

    await createDraftPeriod(db, testMembershipId, membershipTypeId, "2040-08-01", "2041-07-31");
    // Don't add to cleanup array since we're testing delete

    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Find and click our test membership (date display shows end year: 31.7.2041)
    await adminPage
      .getByRole("button", { name: /Varsinainen jäsen.*2041/ })
      .first()
      .click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

    // Click delete button
    await adminPage.getByRole("button", { name: "Poista" }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

    // Verify the membership was deleted from the database
    const [deletedMembership] = await db
      .select()
      .from(table.membershipFeePeriod)
      .where(eq(table.membershipFeePeriod.id, testMembershipId));

    expect(deletedMembership).toBeUndefined();
  });

  test("cancel button closes sheet without saving", async ({ adminPage, db }) => {
    // Create a test membership
    const testMembershipId = crypto.randomUUID();

    await createDraftPeriod(db, testMembershipId, membershipTypeId, "2035-08-01", "2036-07-31");
    testMembershipIds.push(testMembershipId);

    await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Find and click our test membership (date display shows end year: 31.7.2036)
    await adminPage
      .getByRole("button", { name: /Varsinainen jäsen.*2036/ })
      .first()
      .click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

    // Change the type field
    const typeSelect = adminPage.getByLabel("Tyyppi");
    await typeSelect.selectOption(alternateMembershipTypeId);

    // Click cancel button
    await adminPage.getByRole("button", { name: "Peruuta" }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

    // Verify the original type is still shown (change was not saved)
    await expect(adminPage.getByRole("button", { name: /Varsinainen jäsen.*2036/ }).first()).toBeVisible();
  });
});
