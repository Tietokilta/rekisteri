import { test, expect } from "./fixtures/auth";

test.describe("App Customisation", () => {
  test("admin can update general branding", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/customise");

    // Update app name and accent color
    const newAppName = "Test Registry " + Math.random().toString(36).slice(7);
    const newAccentColor = "#ff0000";

    await adminPage.fill('input[name="appNameEn"]', newAppName);
    await adminPage.fill('input[name="accentColor"]', newAccentColor);

    await adminPage.getByTestId("save-customisations").click();

    // Check for success toast - try both languages just in case, or use a more robust locator
    // We expect "Settings updated successfully" (EN) or "Asetukset tallennettu onnistuneesti" (FI)
    await expect(
      adminPage.locator("text=/Settings updated successfully|Asetukset tallennettu onnistuneesti/"),
    ).toBeVisible();

    // Verify changes are reflected on the page (synced via $effect)
    await expect(adminPage.locator('input[name="appNameEn"]')).toHaveValue(newAppName);

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
  });

  test("admin can update organization details", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/customise");

    const newOrgName = "Test Organization " + Math.random().toString(36).slice(7);
    const newOrgShortName = "Test Short " + Math.random().toString(36).slice(7);
    const newBusinessId = "1234567-8";
    const newContact = "test@example.com";

    await adminPage.fill('input[name="organizationNameEn"]', newOrgName);
    await adminPage.fill('input[name="organizationNameShortEn"]', newOrgShortName);
    await adminPage.fill('input[name="businessId"]', newBusinessId);
    await adminPage.fill('input[name="overseerContact"]', newContact);

    await adminPage.getByTestId("save-customisations").click();
    await expect(
      adminPage.locator("text=/Settings updated successfully|Asetukset tallennettu onnistuneesti/"),
    ).toBeVisible();

    // Verify on privacy policy page (which uses these details in footer or content)
    await adminPage.goto("/en/privacy-policy");
    // The footer usually contains org name and business ID
    await expect(adminPage.locator("footer")).toContainText(newOrgName);
    await expect(adminPage.locator("footer")).toContainText(newBusinessId);
    await expect(adminPage.locator("footer")).toContainText(newContact);
  });

  test("readonly admin cannot update customisations", async ({ readonlyAdminPage }) => {
    await readonlyAdminPage.goto("/en/admin/customise");

    // Check if a warning banner is present
    await expect(
      readonlyAdminPage.locator("text=/You have read-only access|Sinulla on vain lukuoikeus/"),
    ).toBeVisible();

    // Try to submit anyway (if button is not disabled)
    const saveButton = readonlyAdminPage.getByTestId("save-customisations");

    const isDisabled = await saveButton.isDisabled();

    if (!isDisabled) {
      const [response] = await Promise.all([
        readonlyAdminPage.waitForResponse((res) => res.status() === 404),
        saveButton.click(),
      ]);
      expect(response.status()).toBe(404);
    }
  });
});
