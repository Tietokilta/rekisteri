import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Membership Types Admin", () => {
  // Track test membership types for cleanup
  let testMembershipTypeIds: string[] = [];

  test.afterEach(async ({ db }) => {
    // Clean up test membership types
    for (const id of testMembershipTypeIds) {
      await db.delete(table.membershipType).where(eq(table.membershipType.id, id));
    }
    testMembershipTypeIds = [];
  });

  test("displays membership types page with existing data", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Verify page title is visible
    await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäsenyystyyppejä" })).toBeVisible();

    // Verify create button exists
    await expect(adminPage.getByRole("button", { name: "Luo uusi tyyppi" })).toBeVisible();

    // Verify at least one membership type is displayed (from seed data)
    await expect(adminPage.getByRole("button", { name: /Varsinainen jäsen/ })).toBeVisible();
  });

  test("opens create membership type sheet", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click create button
    await adminPage.getByRole("button", { name: "Luo uusi tyyppi" }).click();

    // Verify sheet opens with form fields
    await expect(adminPage.getByLabel("Tunniste")).toBeVisible();
    await expect(adminPage.getByLabel("Nimi (suomeksi)")).toBeVisible();
    await expect(adminPage.getByLabel("Nimi (englanniksi)")).toBeVisible();
    await expect(adminPage.getByLabel("Kuvaus (suomeksi, valinnainen)")).toBeVisible();
    await expect(adminPage.getByLabel("Kuvaus (englanniksi, valinnainen)")).toBeVisible();
  });

  test("can create a new membership type", async ({ adminPage }) => {
    const testId = `test-type-${crypto.randomUUID().slice(0, 8)}`;
    testMembershipTypeIds.push(testId);

    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click create button
    await adminPage.getByRole("button", { name: "Luo uusi tyyppi" }).click();

    // Fill in the form
    await adminPage.getByLabel("Tunniste").fill(testId);
    await adminPage.getByLabel("Nimi (suomeksi)").fill("Testityyppi");
    await adminPage.getByLabel("Nimi (englanniksi)").fill("Test type");
    await adminPage.getByLabel("Kuvaus (suomeksi, valinnainen)").fill("Testiä varten");
    await adminPage.getByLabel("Kuvaus (englanniksi, valinnainen)").fill("For testing");

    // Submit the form
    await adminPage.getByRole("button", { name: "Luo", exact: true }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByLabel("Tunniste")).not.toBeVisible();

    // Verify the new type appears in the UI
    await expect(adminPage.getByRole("button", { name: /Testityyppi/ })).toBeVisible();
  });

  test("opens edit sheet when clicking a membership type", async ({ adminPage, db }) => {
    // Create a test membership type
    const testId = `test-edit-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(table.membershipType).values({
      id: testId,
      name: { fi: "Muokkaustyyppi", en: "Edit type" },
      description: { fi: "Muokkauksen testi", en: "Edit test" },
    });
    testMembershipTypeIds.push(testId);

    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click the test membership type
    await adminPage.getByRole("button", { name: /Muokkaustyyppi/ }).click();

    // Verify edit sheet opens
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).toBeVisible();

    // Verify form fields are present with pre-populated data
    await expect(adminPage.getByLabel("Nimi (suomeksi)")).toHaveValue("Muokkaustyyppi");
    await expect(adminPage.getByLabel("Nimi (englanniksi)")).toHaveValue("Edit type");
  });

  test("edit form ID is read-only", async ({ adminPage, db }) => {
    // Create a test membership type
    const testId = `test-readonly-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(table.membershipType).values({
      id: testId,
      name: { fi: "Lukittu ID", en: "Locked ID" },
      description: null,
    });
    testMembershipTypeIds.push(testId);

    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click the test membership type
    await adminPage.getByRole("button", { name: /Lukittu ID/ }).click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).toBeVisible();

    // Verify the ID field is displayed but disabled
    const idField = adminPage.getByLabel("Tunniste");
    await expect(idField).toHaveValue(testId);
    await expect(idField).toBeDisabled();
  });

  test("can update membership type name", async ({ adminPage, db }) => {
    // Create a test membership type
    const testId = `test-update-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(table.membershipType).values({
      id: testId,
      name: { fi: "Vanha nimi", en: "Old name" },
      description: null,
    });
    testMembershipTypeIds.push(testId);

    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click the test membership type
    await adminPage.getByRole("button", { name: /Vanha nimi/ }).click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).toBeVisible();

    // Update the Finnish name
    await adminPage.getByLabel("Nimi (suomeksi)").fill("Uusi nimi");

    // Submit the form
    await adminPage.getByRole("button", { name: "Tallenna" }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).not.toBeVisible();

    // Verify the updated name appears in the UI
    await expect(adminPage.getByRole("button", { name: /Uusi nimi/ })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: /Vanha nimi/ })).not.toBeVisible();
  });

  test("can delete membership type with no memberships", async ({ adminPage, db }) => {
    // Create a test membership type with no memberships
    const testId = `test-delete-${crypto.randomUUID().slice(0, 8)}`;
    const uniqueName = `Poistettava ${testId}`;
    await db.insert(table.membershipType).values({
      id: testId,
      name: { fi: uniqueName, en: "To delete" },
      description: null,
    });
    // Don't add to cleanup array since we're testing delete

    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click the test membership type (use unique name to avoid collision with leftover data)
    await adminPage.getByRole("button", { name: new RegExp(testId) }).click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).toBeVisible();

    // Click delete button
    await adminPage.getByRole("button", { name: "Poista" }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).not.toBeVisible();

    // Verify the membership type no longer appears in the UI
    await expect(adminPage.getByRole("button", { name: new RegExp(testId) })).not.toBeVisible();
  });

  test("cannot delete membership type with memberships", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click an existing membership type from seed data that has memberships
    await adminPage.getByRole("button", { name: /Varsinainen jäsen/ }).click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).toBeVisible();

    // Verify delete button is not present (only shown when membershipCount === 0)
    await expect(adminPage.getByRole("button", { name: "Poista" })).not.toBeVisible();

    // Verify the "cannot delete" message is shown
    await expect(adminPage.getByText("Jäsenyystyyppiä ei voi poistaa")).toBeVisible();
  });

  test("cancel button closes sheet without saving", async ({ adminPage, db }) => {
    // Create a test membership type
    const testId = `test-cancel-${crypto.randomUUID().slice(0, 8)}`;
    await db.insert(table.membershipType).values({
      id: testId,
      name: { fi: "Peruutustyyppi", en: "Cancel type" },
      description: null,
    });
    testMembershipTypeIds.push(testId);

    await adminPage.goto(route("/[locale=locale]/admin/membership-types", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Click the test membership type
    await adminPage.getByRole("button", { name: /Peruutustyyppi/ }).click();

    // Wait for the sheet to open
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).toBeVisible();

    // Change the name
    await adminPage.getByLabel("Nimi (suomeksi)").fill("Uusi nimi");

    // Click cancel button
    await adminPage.getByRole("button", { name: "Peruuta" }).click();

    // Wait for the sheet to close
    await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyystyyppiä" })).not.toBeVisible();

    // Verify the original name is still shown (change was not saved)
    await expect(adminPage.getByRole("button", { name: /Peruutustyyppi/ })).toBeVisible();
  });
});
