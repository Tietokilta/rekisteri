import { test, expect } from "./fixtures/isolated-user";
import * as table from "#lib/server/db/schema.js";
import { eq } from "drizzle-orm";

/**
 * noreadext role E2E tests.
 *
 * noreadext marks users of external applications (via OIDC). It grants the same
 * capabilities as `none`: no access to admin pages.
 */

test.describe("noreadext role", () => {
  test.beforeEach(async ({ db, isolatedUser }) => {
    await db.update(table.user).set({ adminRole: "noreadext" }).where(eq(table.user.id, isolatedUser.id));
  });

  test("cannot access admin routes", async ({ isolatedContext }) => {
    for (const path of ["/fi/admin/members", "/fi/admin/users", "/fi/admin/memberships", "/fi/admin/settings"]) {
      const response = await isolatedContext.request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
  });

  test("can still use the regular app", async ({ isolatedPage }) => {
    const response = await isolatedPage.goto("/fi");
    expect(response?.status()).toBe(200);
    await expect(isolatedPage).toHaveURL(/\/fi/);
  });

  test("is listed among regular users with its own label", async ({ adminPage, isolatedUser }) => {
    await adminPage.goto("/fi/admin/users");
    await expect(adminPage.getByTestId("admin-users-page")).toBeVisible();
    await adminPage.getByPlaceholder("Hae käyttäjiä...").fill(isolatedUser.email);

    // The admins table lists only admin and readonly users, so the row must be in the regular users table
    const row = adminPage.getByRole("row").filter({ hasText: isolatedUser.email });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("role-selector")).toHaveText("Ulkoinen käyttäjä");
  });
});

test.describe("Assigning the noreadext role", () => {
  test("admin can change a user's role to noreadext and back", async ({ adminPage, isolatedUser, db }) => {
    await adminPage.goto("/fi/admin/users");
    await expect(adminPage.getByTestId("admin-users-page")).toBeVisible();
    await adminPage.getByPlaceholder("Hae käyttäjiä...").fill(isolatedUser.email);

    const row = adminPage.getByRole("row").filter({ hasText: isolatedUser.email });
    const selector = row.getByTestId("role-selector");
    await expect(selector).toHaveText("Käyttäjä");

    await selector.click();
    await adminPage.getByRole("option", { name: "Ulkoinen käyttäjä" }).click();
    await expect(selector).toHaveText("Ulkoinen käyttäjä");
    await expect
      .poll(async () => (await db.query.user.findFirst({ where: { id: isolatedUser.id } }))?.adminRole)
      .toBe("noreadext");

    await selector.click();
    await adminPage.getByRole("option", { name: "Käyttäjä", exact: true }).click();
    await expect(selector).toHaveText("Käyttäjä");
    await expect
      .poll(async () => (await db.query.user.findFirst({ where: { id: isolatedUser.id } }))?.adminRole)
      .toBe("none");
  });
});
