import { desc, eq } from "drizzle-orm";
import * as table from "../src/lib/server/db/schema";
import { test, expect } from "./fixtures/db";

test.describe("App Customization", () => {
  test("admin can update general branding", async ({ adminPage, adminUser, db }) => {
    await adminPage.goto("/en/admin/settings");

    // Update app name and accent color
    const newAppName = "Test Registry " + Math.random().toString(36).slice(7);
    const currentAccentColor = await adminPage.inputValue("#accentColor");
    const newAccentColor = currentAccentColor.toLowerCase() === "#ff0000" ? "#00ff00" : "#ff0000";

    await adminPage.fill("#appNameEN", newAppName);
    await adminPage.fill("#accentColor", newAccentColor);

    await adminPage.getByTestId("save-customizations").click();

    // Check for success toast - try both languages just in case, or use a more robust locator
    // We expect "Settings updated successfully" (EN) or "Asetukset tallennettu onnistuneesti" (FI)
    await expect(
      adminPage.locator("text=/Settings updated successfully|Asetukset tallennettu onnistuneesti/"),
    ).toBeVisible();

    // Verify changes are reflected on the page (synced via $effect)
    await expect(adminPage.locator("#appNameEN")).toHaveValue(newAppName);

    // Verify changes on a public page
    await adminPage.goto("/en");
    await expect(adminPage).toHaveTitle(new RegExp(newAppName));

    // Verify accent color in head
    // The style tag is injected via {@html} in +layout.svelte
    await expect(async () => {
      const styles = await adminPage.evaluate(() => {
        const styleTags = Array.from(document.querySelectorAll("style"));
        return styleTags.map((s) => s.textContent).join("\n");
      });
      expect(styles).toContain(`--primary: ${newAccentColor}`);
    }).toPass();

    const [auditLog] = await db
      .select()
      .from(table.auditLog)
      .where(eq(table.auditLog.action, "app_customization.update"))
      .orderBy(desc(table.auditLog.createdAt))
      .limit(1);
    const metadata = auditLog?.metadata as
      { changedFields?: string[]; uploadedImages?: string[]; removedImages?: string[] } | null | undefined;

    expect(auditLog?.userId).toBe(adminUser.id);
    expect(auditLog?.targetType).toBe("app_customization");
    expect(auditLog?.targetId).toBe("1");
    expect(metadata?.changedFields).toEqual(expect.arrayContaining(["accentColor", "appName"]));
    expect(metadata?.uploadedImages).toEqual([]);
    expect(metadata?.removedImages).toEqual([]);
  });

  test("admin can update organization details", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    // Switch to Organization tab
    await adminPage.getByTestId("tab-organization").click();

    const newOrgName = "Test Organization " + Math.random().toString(36).slice(7);
    const newOrgLegalName = "Test Organization ry " + Math.random().toString(36).slice(7);
    const newBusinessId = "1234567-8";
    const newContact = "test@example.com";

    await adminPage.fill("#orgNameEN", newOrgName);
    await adminPage.fill("#orgLegalNameEN", newOrgLegalName);
    await adminPage.fill("#businessId", newBusinessId);
    await adminPage.fill("#overseerContact", newContact);

    await adminPage.getByTestId("save-customizations").click();
    await expect(
      adminPage.locator("text=/Settings updated successfully|Asetukset tallennettu onnistuneesti/"),
    ).toBeVisible();

    // Verify on privacy policy page (which uses these details in footer or content)
    await adminPage.goto("/en/privacy-policy");
    // The footer contains the legal name and registry details
    await expect(adminPage.locator("footer")).toContainText(newOrgLegalName);
    await expect(adminPage.locator("footer")).toContainText(newBusinessId);
    await expect(adminPage.locator("footer")).toContainText(newContact);
  });

  test("admin can update organization rules URLs and they reflect on membership purchase page", async ({
    adminPage,
  }) => {
    await adminPage.goto("/en/admin/settings");

    await adminPage.getByTestId("tab-resignation").click();

    const rulesUrlFi = "https://example.com/saannot-" + Math.random().toString(36).slice(7);
    const rulesUrlEn = "https://example.com/rules-" + Math.random().toString(36).slice(7);

    await adminPage.fill("#rulesUrlFi", rulesUrlFi);
    await adminPage.fill("#rulesUrlEn", rulesUrlEn);

    await adminPage.getByTestId("save-customizations").click();
    await expect(
      adminPage.locator("text=/Settings updated successfully|Asetukset tallennettu onnistuneesti/"),
    ).toBeVisible();

    // Verify on Finnish /fi/new page
    await adminPage.goto("/fi/new");
    const rulesLinkFi = adminPage.locator('a[target="_blank"]', { hasText: /killan säännöissä/i });
    await expect(rulesLinkFi).toBeVisible();
    await expect(rulesLinkFi).toHaveAttribute("href", rulesUrlFi);

    // Verify on English /en/new page
    await adminPage.goto("/en/new");
    const rulesLinkEn = adminPage.locator('a[target="_blank"]', { hasText: /guild bylaws/i });
    await expect(rulesLinkEn).toBeVisible();
    await expect(rulesLinkEn).toHaveAttribute("href", rulesUrlEn);
  });

  test("saving with an invalid field on another tab switches to that tab and shows the error", async ({
    adminPage,
  }) => {
    await adminPage.goto("/en/admin/settings");

    await adminPage.getByTestId("tab-resignation").click();
    await adminPage.fill("#rulesUrlEn", "not a url");

    await adminPage.getByTestId("tab-branding").click();
    await expect(adminPage.locator("#rulesUrlEn")).toBeHidden();

    await adminPage.getByTestId("save-customizations").click();

    await expect(adminPage.getByTestId("tab-resignation")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#rulesUrlEn")).toBeVisible();
    await expect(adminPage.locator("#rulesUrlEn")).toHaveValue("not a url");
    await expect(adminPage.getByTestId("rulesUrlEn-error")).toBeVisible();
    await expect(adminPage.locator("#rulesUrlEn")).toBeFocused();
    await expect(adminPage.locator("text=/Failed to update settings/").first()).toBeVisible();

    // Saving again with the same error after leaving the tab jumps back again
    await adminPage.getByTestId("tab-branding").click();
    await expect(adminPage.locator("#rulesUrlEn")).toBeHidden();
    await adminPage.getByTestId("save-customizations").click();

    await expect(adminPage.getByTestId("tab-resignation")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#rulesUrlEn")).toBeFocused();
  });

  test("an empty privacy policy focuses its editor", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    await adminPage.getByTestId("tab-privacy-policy").click();
    await adminPage.fill("#privacyPolicyFI", "");
    await adminPage.getByTestId("tab-branding").click();
    await adminPage.getByTestId("save-customizations").click();

    await expect(adminPage.getByTestId("tab-privacy-policy")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#privacyPolicyFI")).toBeFocused();
  });

  test("errors from an earlier visit don't replay when returning to the page", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    await adminPage.getByTestId("tab-resignation").click();
    await adminPage.fill("#rulesUrlEn", "not a url");
    await adminPage.getByTestId("save-customizations").click();
    const errorToast = adminPage.locator("text=/Failed to update settings/");
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toBeHidden({ timeout: 10_000 });

    // Client-side navigation keeps the remote form instance (and its issues) alive
    await adminPage.locator('a[href="/en/admin/members"]').first().click();
    await expect(adminPage).toHaveURL(/\/en\/admin\/members/);
    await adminPage.goBack();
    await expect(adminPage).toHaveURL(/\/en\/admin\/settings/);

    await expect(adminPage.getByTestId("tab-branding")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#rulesUrlEn")).toBeHidden();
    await expect(errorToast).toBeHidden();
  });

  test("a new client-side error wins over a stale server-side one", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    // Passes the client-side schema but the server rejects invalid UTF-8
    await adminPage.setInputFiles("#logo", {
      name: "broken.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from([0xff, 0xfe, 0xfd]),
    });
    await adminPage.getByTestId("save-customizations").click();
    await expect(adminPage.locator("text=/Must be a valid UTF-8 SVG image/")).toBeVisible();

    // Kit keeps the logo error until the next server response, which a failing preflight never sends
    await adminPage.setInputFiles("#logo", []);
    await adminPage.getByTestId("tab-resignation").click();
    await adminPage.fill("#rulesUrlEn", "not a url");
    await adminPage.getByTestId("tab-organization").click();
    await adminPage.getByTestId("save-customizations").click();

    await expect(adminPage.getByTestId("tab-resignation")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#rulesUrlEn")).toBeFocused();
  });

  test("a stale server-side error is still ignored after leaving and returning to the page", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    await adminPage.setInputFiles("#logo", {
      name: "broken.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from([0xff, 0xfe, 0xfd]),
    });
    await adminPage.getByTestId("save-customizations").click();
    await expect(adminPage.locator("text=/Must be a valid UTF-8 SVG image/")).toBeVisible();

    // Client-side navigation keeps the remote form instance (and the server's logo error) alive
    await adminPage.locator('a[href="/en/admin/members"]').first().click();
    await expect(adminPage).toHaveURL(/\/en\/admin\/members/);
    await adminPage.goBack();
    await expect(adminPage).toHaveURL(/\/en\/admin\/settings/);

    await adminPage.getByTestId("tab-resignation").click();
    await adminPage.fill("#rulesUrlEn", "not a url");
    await adminPage.getByTestId("tab-organization").click();
    await adminPage.getByTestId("save-customizations").click();

    await expect(adminPage.getByTestId("tab-resignation")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#rulesUrlEn")).toBeFocused();
  });

  test("a network error after a server-side validation error doesn't replay the old error", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    await adminPage.setInputFiles("#logo", {
      name: "broken.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from([0xff, 0xfe, 0xfd]),
    });
    await adminPage.getByTestId("save-customizations").click();
    const errorToast = adminPage.locator("text=/Failed to update settings/");
    await expect(errorToast).toBeVisible();
    await expect(errorToast).toBeHidden({ timeout: 10_000 });

    await adminPage.setInputFiles("#logo", []);
    await adminPage.getByTestId("tab-organization").click();
    await adminPage.route("**/_app/remote/**", (route) => route.abort());
    await adminPage.getByTestId("save-customizations").click();

    await expect(errorToast).toHaveCount(1);
    await expect(adminPage.getByTestId("tab-organization")).toHaveAttribute("data-state", "active");
    await expect(adminPage.locator("#logo")).not.toBeFocused();
  });

  test("a successful save after a server-side validation error stays on the current tab", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/settings");

    // Passes the client-side schema (SVG name and type, small size) but the server rejects invalid UTF-8
    await adminPage.setInputFiles("#logo", {
      name: "broken.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from([0xff, 0xfe, 0xfd]),
    });
    await adminPage.getByTestId("save-customizations").click();
    await expect(adminPage.locator("text=/Must be a valid UTF-8 SVG image/")).toBeVisible();

    await adminPage.setInputFiles("#logo", []);
    await adminPage.getByTestId("tab-organization").click();
    await adminPage.getByTestId("save-customizations").click();

    await expect(
      adminPage.locator("text=/Settings updated successfully|Asetukset tallennettu onnistuneesti/"),
    ).toBeVisible();
    await expect(adminPage.getByTestId("tab-organization")).toHaveAttribute("data-state", "active");
  });

  test("readonly admin cannot update customizations", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/en/admin/settings");

    // Check if a warning banner is present
    await expect(
      readonlyAdminPage.locator("text=/You have read-only access|Sinulla on vain lukuoikeus/"),
    ).toBeVisible();

    // Try to submit anyway (if button is not disabled)
    const saveButton = readonlyAdminPage.getByTestId("save-customizations");

    const isDisabled = await saveButton.isDisabled();

    if (isDisabled) return;
    const [response] = await Promise.all([
      readonlyAdminPage.waitForResponse((res) => res.status() === 404),
      saveButton.click(),
    ]);
    expect(response.status()).toBe(404);
  });
});
