import { test, expect } from "@playwright/test";

test("switching language keeps the path and query string", async ({ page }) => {
  await page.goto("/fi/sign-in?foo=bar");
  // Toggle group items render as radios
  await page.getByRole("radio", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/sign-in\?foo=bar$/);
});
