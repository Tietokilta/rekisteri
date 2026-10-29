import { test, expect } from "@playwright/test";

test("unknown path under a locale shows the localized 404 page", async ({ page }) => {
  const response = await page.goto("/en/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/en");
});

test("unknown nested path in Finnish shows the localized 404 page", async ({ page }) => {
  const response = await page.goto("/fi/foo/bar");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Sivua ei löytynyt")).toBeVisible();
});

test("unknown path without a locale is redirected to a localized 404", async ({ page }) => {
  const response = await page.goto("/xx/foo");
  await expect(page).toHaveURL(/\/fi\/xx\/foo$/);
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Sivua ei löytynyt")).toBeVisible();
});

test("admin routes stay hidden from signed-out users", async ({ request }) => {
  const response = await request.get("/en/admin/members", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).toBe("Not found");
});
