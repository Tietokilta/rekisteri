import { test, expect } from "./fixtures/auth";

test.describe("Authentication", () => {
	test("admin page fixture can access admin members page", async ({ adminPage }) => {
		// Navigate to admin members page which requires authentication
		await adminPage.goto("/fi/admin/members", { waitUntil: "networkidle" });

		// Verify we're on the admin members page (handles i18n routes)
		// and not redirected to sign-in page
		await expect(adminPage).toHaveURL(/\/(fi|en)\/(hallinta\/jasenet|admin\/members)/);
		await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);
	});

	test("authenticated admin can see user profile on home page", async ({ adminPage }) => {
		await adminPage.goto("/fi/", { waitUntil: "networkidle" });

		// Verify we're not redirected to sign-in
		await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);

		// Check for readonly email input (indicates authenticated user viewing their profile)
		const emailInput = adminPage.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
		await expect(emailInput).toHaveValue("root@tietokilta.fi");
	});

	test("user info form refreshes displayed data after save", async ({ adminPage }) => {
		await adminPage.goto("/fi/", { waitUntil: "networkidle" });

		// Get current values from the welcome message
		const welcomeHeading = adminPage.locator("h1").first();
		const originalWelcomeText = (await welcomeHeading.textContent()) ?? "";

		// Find the form inputs
		const firstNamesInput = adminPage.locator('input[autocomplete="given-name"]');
		const lastNameInput = adminPage.locator('input[autocomplete="family-name"]');

		// Get original values
		const originalFirstNames = await firstNamesInput.inputValue();
		const originalLastName = await lastNameInput.inputValue();

		// Change the name
		const newFirstNames = "TestFirst";
		const newLastName = "TestLast";
		await firstNamesInput.fill(newFirstNames);
		await lastNameInput.fill(newLastName);

		// Submit the form
		const saveButton = adminPage.locator('button[type="submit"]', { hasText: /Tallenna|Save/i });
		await saveButton.click();

		// Wait for success toast
		await expect(adminPage.locator("text=/Tallennettu|Saved/i")).toBeVisible({ timeout: 5000 });

		// Verify the welcome message updates immediately (without page refresh)
		await expect(welcomeHeading).toContainText(newFirstNames);
		await expect(welcomeHeading).toContainText(newLastName);
		await expect(welcomeHeading).not.toHaveText(originalWelcomeText);

		// Verify form inputs still have the new values
		await expect(firstNamesInput).toHaveValue(newFirstNames);
		await expect(lastNameInput).toHaveValue(newLastName);

		// Restore original values
		await firstNamesInput.fill(originalFirstNames);
		await lastNameInput.fill(originalLastName);
		await saveButton.click();

		// Wait for success toast
		await expect(adminPage.locator("text=/Tallennettu|Saved/i")).toBeVisible({ timeout: 5000 });

		// Verify values are restored
		await expect(welcomeHeading).toContainText(originalFirstNames);
		await expect(welcomeHeading).toContainText(originalLastName);
	});
});
