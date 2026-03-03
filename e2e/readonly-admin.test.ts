import { test, expect } from "./fixtures/auth";

/**
 * Read-only admin E2E tests.
 *
 * Tests that read-only admins:
 * - Can access admin pages (members, memberships, membership types, users)
 * - Cannot see write action buttons (add, edit, delete, approve, etc.)
 * - Cannot access the import page (returns 404)
 * - Cannot see bulk action checkboxes
 */

test.describe("Read-only Admin Access", () => {
  test("can access members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");

    // Page should load successfully
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Data table should be visible
    await expect(readonlyAdminPage.getByRole("table")).toBeVisible();
  });

  test("can access memberships page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/memberships");

    // Page should load successfully
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäsenyyskausia" })).toBeVisible();
  });

  test("can access membership types page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/membership-types");

    // Page should load successfully
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäsenyystyyppejä" })).toBeVisible();
  });

  test("can access users page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/users");

    // Page should load successfully
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi käyttäjiä" })).toBeVisible();

    // Data table should be visible
    await expect(readonlyAdminPage.getByRole("table")).toBeVisible();
  });

  test("cannot access import page (returns 404)", async ({ readonlyAdminPage }) => {
    const response = await readonlyAdminPage.goto("/fi/admin/members/import");

    // Should return 404
    expect(response?.status()).toBe(404);
  });
});

test.describe("Read-only Admin Hidden Actions", () => {
  test("cannot see Add Member button on members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Add member button should not be visible
    await expect(readonlyAdminPage.getByRole("button", { name: "Lisää jäsen" })).not.toBeVisible();
    await expect(readonlyAdminPage.getByRole("link", { name: "Lisää jäsen" })).not.toBeVisible();
  });

  test("cannot see Import link on members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Import link should not be visible
    await expect(readonlyAdminPage.getByRole("link", { name: "Tuo" })).not.toBeVisible();
    await expect(readonlyAdminPage.getByRole("link", { name: "Tuo CSV" })).not.toBeVisible();
  });

  test("cannot see row checkboxes on members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Wait for table to load
    await expect(readonlyAdminPage.getByRole("table")).toBeVisible();

    // Checkboxes should not be visible
    await expect(readonlyAdminPage.getByTestId("select-all-checkbox")).not.toBeVisible();
    await expect(readonlyAdminPage.getByTestId("row-select-checkbox").first()).not.toBeVisible();
  });

  test("cannot see Create button on memberships page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/memberships");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäsenyyskausia" })).toBeVisible();

    // Create button should not be visible
    await expect(readonlyAdminPage.getByRole("button", { name: "Luo jäsenyyskausi" })).not.toBeVisible();
  });

  test("cannot see Create button on membership types page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/membership-types");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäsenyystyyppejä" })).toBeVisible();

    // Create button should not be visible
    await expect(readonlyAdminPage.getByRole("button", { name: "Luo jäsenyystyyppi" })).not.toBeVisible();
  });

  test("cannot see role selector on users page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/users");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi käyttäjiä" })).toBeVisible();

    // Wait for table to load
    await expect(readonlyAdminPage.getByRole("table")).toBeVisible();

    // Role selector should not be visible
    await expect(readonlyAdminPage.getByTestId("role-selector").first()).not.toBeVisible();
  });

  test("cannot see Merge Users button on users page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/users");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi käyttäjiä" })).toBeVisible();

    // Merge button should not be visible
    await expect(readonlyAdminPage.getByRole("button", { name: "Yhdistä käyttäjät" })).not.toBeVisible();
  });
});

test.describe("Read-only Admin Navigation", () => {
  test("cannot see Import link in sidebar", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Check sidebar for import link - it should not be visible
    // The sidebar nav should exist but not contain the import link
    const sidebar = readonlyAdminPage.getByRole("navigation");
    await expect(sidebar.getByRole("link", { name: "Tuo" })).not.toBeVisible();
  });

  test("can see admin navigation links", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // These links should be visible in the sidebar
    const sidebar = readonlyAdminPage.getByRole("navigation");
    await expect(sidebar.getByRole("link", { name: "Jäsenet" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Jäsenyyskaudet" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Jäsenyystyypit" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Käyttäjät" })).toBeVisible();
  });
});

test.describe("Full Admin vs Read-only Admin", () => {
  test("full admin can see Add Member button", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/members");
    await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Add member button should be visible for full admin
    await expect(adminPage.getByRole("link", { name: "Lisää jäsen" })).toBeVisible();
  });

  test("full admin can see row checkboxes", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/members");
    await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

    // Checkboxes should be visible for full admin
    await expect(adminPage.getByTestId("select-all-checkbox")).toBeVisible();
  });

  test("full admin can see role selector on users page", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/users");
    await expect(adminPage.getByRole("heading", { name: "Hallinnoi käyttäjiä" })).toBeVisible();

    // Wait for table to load
    await expect(adminPage.getByRole("table")).toBeVisible();

    // Role selector should be visible for full admin
    await expect(adminPage.getByTestId("role-selector").first()).toBeVisible();
  });

  test("full admin can access import page", async ({ adminPage }) => {
    const response = await adminPage.goto("/fi/admin/members/import");

    // Should return 200
    expect(response?.status()).toBe(200);

    // Page should load successfully
    await expect(adminPage.getByRole("heading", { name: "Tuo jäseniä" })).toBeVisible();
  });
});
