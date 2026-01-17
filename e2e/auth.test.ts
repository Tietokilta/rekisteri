import { test, expect } from "./fixtures/auth";
import { route } from "../src/lib/ROUTES";

test.describe("Authentication", () => {
	test("admin page fixture can access admin members page", async ({ adminPage }) => {
		// Navigate to admin members page which requires authentication
		await adminPage.goto(route("/[locale=locale]/admin/members", { locale: "fi" }), { waitUntil: "networkidle" });

		// Verify we're on the admin members page (handles i18n routes)
		// and not redirected to sign-in page
		await expect(adminPage).toHaveURL(/\/(fi|en)\/(hallinta\/jasenet|admin\/members)/);
		await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);
	});

	test("authenticated admin can see dashboard on home page", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), { waitUntil: "networkidle" });

		// Verify we're not redirected to sign-in
		await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);

		// Check for the welcome heading on dashboard
		const welcomeHeading = adminPage.locator("h1").first();
		await expect(welcomeHeading).toBeVisible();
		await expect(welcomeHeading).toContainText(/Tervetuloa|Welcome/);
	});

	test("user info form refreshes displayed data after save", async ({ adminPage }) => {
		// Navigate to profile settings page where the form now lives
		await adminPage.goto(route("/[locale=locale]/settings/profile", { locale: "fi" }), { waitUntil: "networkidle" });

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
		await expect(firstNamesInput).toHaveValue(originalFirstNames);
		await expect(lastNameInput).toHaveValue(originalLastName);
	});
});
