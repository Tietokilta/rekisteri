import { test, expect } from "./fixtures/isolated-user";
import * as table from "#lib/server/db/schema.js";
import { inArray } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Preferred name", () => {
  test("is used instead of first names once set, and cleared back to them", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    await isolatedPage.goto(route("/[locale=locale]/settings/profile", { locale: "fi" }), {
      waitUntil: "networkidle",
    });
    const sidebar = isolatedPage.locator("[data-slot='sidebar']");
    await expect(sidebar.getByText("Test User")).toBeVisible();

    await isolatedPage.getByTestId("preferredName-input").fill("Tessa");
    await isolatedPage.getByRole("button", { name: "Tallenna" }).click();
    await expect(sidebar.getByText("Tessa User")).toBeVisible();
    const saved = await db.query.user.findFirst({ where: { id: isolatedUser.id } });
    expect(saved?.preferredName).toBe("Tessa");
    expect(saved?.firstNames).toBe("Test");

    await isolatedPage.getByTestId("preferredName-input").fill("");
    await isolatedPage.getByRole("button", { name: "Tallenna" }).click();
    await expect(sidebar.getByText("Test User")).toBeVisible();
    await expect
      .poll(async () => (await db.query.user.findFirst({ where: { id: isolatedUser.id } }))?.preferredName)
      .toBeNull();
  });
});

test.describe("Preferred name in admin lists", () => {
  test("underlines the called first name, and italicizes one outside the first names", async ({ adminPage, db }) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const users = [
      { id: crypto.randomUUID(), firstNames: "Juho Matti", preferredName: "Matti" },
      { id: crypto.randomUUID(), firstNames: "Mikael Johannes", preferredName: "Mitti" },
      { id: crypto.randomUUID(), firstNames: "Anna Liisa Maria", preferredName: "Anna Liisa" },
    ].map((u) => ({ ...u, lastName: `Lista${suffix}`, email: `${u.id}@example.com`, adminRole: "none" as const }));
    await db.insert(table.user).values(users);
    try {
      await adminPage.goto(route("/[locale=locale]/admin/users", { locale: "fi" }), { waitUntil: "networkidle" });
      await adminPage.getByPlaceholder("Hae käyttäjiä...").fill(`Lista${suffix}`);
      const called = adminPage.getByRole("row").filter({ hasText: "Juho Matti" }).getByTestId("called-name");
      await expect(called).toHaveText("Matti");
      const other = adminPage.getByRole("row").filter({ hasText: "Mikael Johannes" }).getByTestId("preferred-name");
      await expect(other).toHaveText("Mitti");
      const annaRow = adminPage.getByRole("row").filter({ hasText: "Anna Liisa Maria" });
      await expect(annaRow.getByTestId("called-name")).toHaveText(["Anna", "Liisa"]);
      await expect(annaRow.getByTestId("preferred-name")).toHaveCount(0);
    } finally {
      await db.delete(table.user).where(
        inArray(
          table.user.id,
          users.map((u) => u.id),
        ),
      );
    }
  });
});
