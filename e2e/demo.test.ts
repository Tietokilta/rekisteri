import { expect, test } from "@playwright/test";
import { route } from "../src/lib/ROUTES";

test("home page has expected h1", async ({ page }) => {
  await page.goto(route("/[locale=locale]", { locale: "fi" }));
  await expect(page.locator("h1")).toBeVisible();
});
