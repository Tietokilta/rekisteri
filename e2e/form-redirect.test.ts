import { test, expect } from "./fixtures/auth";

test.describe("Form Redirects", () => {
	test("profile form submission redirects correctly", async ({ adminPage }) => {
		// Navigate to home page (profile page)
		await adminPage.goto("/fi/", { waitUntil: "networkidle" });

		// Verify we're on the profile page
		await expect(adminPage).toHaveURL(/\/fi\/?$/);

		// Fill out the profile form
		const firstNamesInput = adminPage.locator('input[name="firstNames"]');
		await firstNamesInput.fill("Test");

		// Submit the form
		await adminPage.locator('button[type="submit"]').first().click();

		// Wait for navigation
		await adminPage.waitForURL(/\/fi\/?$/, { timeout: 5000 });

		// Verify we're still on the profile page (successful redirect)
		await expect(adminPage).toHaveURL(/\/fi\/?$/);
	});

	test("sign out redirects to sign-in page", async ({ adminPage }) => {
		// Navigate to home page
		await adminPage.goto("/fi/", { waitUntil: "networkidle" });

		// Click sign out button
		const signOutButton = adminPage.locator('button[type="submit"]').filter({ hasText: /kirjaudu ulos|sign out/i });
		await signOutButton.click();

		// Wait for redirect to sign-in page
		await adminPage.waitForURL(/\/(fi|en)\/(kirjaudu|sign-in)/, { timeout: 5000 });

		// Verify we're on the sign-in page
		await expect(adminPage).toHaveURL(/\/(fi|en)\/(kirjaudu|sign-in)/);
	});

	test("preferred language change triggers redirect on next GET", async ({ adminPage }) => {
		// Navigate to home page in Finnish
		await adminPage.goto("/fi/", { waitUntil: "networkidle" });

		// Change preferred language to English
		const languageSelect = adminPage.locator('select[name="preferredLanguage"]');
		await languageSelect.selectOption("english");

		// Submit the form
		await adminPage.locator('button[type="submit"]').first().click();

		// Wait for the form submission to complete
		await adminPage.waitForLoadState("networkidle");

		// Now navigate to a page - should redirect to English version
		await adminPage.goto("/fi/admin/members");

		// Should be redirected to English version
		await expect(adminPage).toHaveURL(/\/en\/admin\/members/);
	});
});
