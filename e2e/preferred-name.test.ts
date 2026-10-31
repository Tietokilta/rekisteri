import { test, expect } from "./fixtures/isolated-user";
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
