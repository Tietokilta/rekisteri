import { test, expect } from "./fixtures/auth";

/**
 * Read-only admin E2E tests.
 *
 * Tests that read-only admins:
 * - Can access admin pages (members, memberships, membership types, users)
 * - Cannot see write action buttons (add, edit, delete, approve, etc.)
 * - Cannot access the import page (shows error)
 * - Cannot see bulk action checkboxes
 */

test.describe("Read-only Admin Access", () => {
  test("can access members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByTestId("admin-members-page")).toBeVisible();
    await expect(readonlyAdminPage.getByRole("table")).toBeVisible();
  });

  test("can access memberships page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/memberships");
    await expect(readonlyAdminPage.getByTestId("admin-memberships-page")).toBeVisible();
  });

  test("can access membership types page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/membership-types");
    await expect(readonlyAdminPage.getByTestId("admin-membership-types-page")).toBeVisible();
  });

  test("can access users page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/users");
    await expect(readonlyAdminPage.getByTestId("admin-users-page")).toBeVisible();
    await expect(readonlyAdminPage.getByRole("table").first()).toBeVisible();
  });

  test("cannot access import page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members/import");
    // SSR is disabled for admin routes, so the error renders client-side (status 200).
    // The important assertion is that the import form itself is not shown.
    await expect(readonlyAdminPage.getByTestId("import-members-page")).not.toBeVisible();
  });
});

test.describe("Read-only Admin Hidden Actions", () => {
  test("cannot see Add Member or Import buttons on members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByTestId("admin-members-page")).toBeVisible();

    await expect(readonlyAdminPage.getByTestId("add-member-button")).not.toBeVisible();
    await expect(readonlyAdminPage.getByTestId("import-members-button")).not.toBeVisible();
  });

  test("cannot see row checkboxes on members page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/members");
    await expect(readonlyAdminPage.getByTestId("admin-members-page")).toBeVisible();
    await expect(readonlyAdminPage.getByRole("table")).toBeVisible();

    await expect(readonlyAdminPage.getByTestId("select-all-checkbox")).not.toBeVisible();
  });

  test("cannot see Create button on memberships page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/memberships");
    await expect(readonlyAdminPage.getByTestId("admin-memberships-page")).toBeVisible();

    await expect(readonlyAdminPage.getByTestId("create-membership-button")).not.toBeVisible();
  });

  test("cannot see Create button on membership types page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/membership-types");
    await expect(readonlyAdminPage.getByTestId("admin-membership-types-page")).toBeVisible();

    await expect(readonlyAdminPage.getByTestId("create-membership-type-button")).not.toBeVisible();
  });

  test("cannot see actions column or role selector on users page", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/fi/admin/users");
    await expect(readonlyAdminPage.getByTestId("admin-users-page")).toBeVisible();
    await expect(readonlyAdminPage.getByRole("table").first()).toBeVisible();

    // Actions column and role selectors should not be visible for readonly admin
    await expect(readonlyAdminPage.getByTestId("actions-column")).not.toBeVisible();
    await expect(readonlyAdminPage.getByTestId("role-selector")).not.toBeVisible();
  });
});

test.describe("Full Admin vs Read-only Admin", () => {
  test("full admin can see Add Member button", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/members");
    await expect(adminPage.getByTestId("admin-members-page")).toBeVisible();
    await expect(adminPage.getByTestId("add-member-button")).toBeVisible();
  });

  test("full admin can see row checkboxes", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/members");
    await expect(adminPage.getByTestId("admin-members-page")).toBeVisible();
    await expect(adminPage.getByTestId("select-all-checkbox")).toBeVisible();
  });

  test("full admin can see actions column and role selector on users page", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/users");
    await expect(adminPage.getByTestId("admin-users-page")).toBeVisible();
    await expect(adminPage.getByRole("table").first()).toBeVisible();

    await expect(adminPage.getByTestId("actions-column").first()).toBeVisible();
    await expect(adminPage.getByTestId("role-selector").first()).toBeVisible();
  });

  test("full admin can access import page", async ({ adminPage }) => {
    await adminPage.goto("/fi/admin/members/import");
    await expect(adminPage.getByTestId("import-members-page")).toBeVisible();
  });
});
