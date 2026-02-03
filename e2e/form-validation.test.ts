import { test, expect } from "./fixtures/auth";
import { route } from "../src/lib/ROUTES";

test.describe("Form Validation UX - Reward Early, Validate Late", () => {
	test("should not show validation errors while typing initially", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/settings/profile", { locale: "fi" }), { waitUntil: "networkidle" });

		const firstNamesInput = adminPage.getByTestId("firstNames-input");
		const firstNamesError = adminPage.getByTestId("firstNames-error");

		// Get the original value
		const originalValue = await firstNamesInput.inputValue();

		// Clear the field (this should trigger validation if it were oninput)
		await firstNamesInput.clear();

		// Type a new value character by character
		await firstNamesInput.pressSequentially("T", { delay: 50 });

		// Error should NOT be visible while typing (before blur)
		await expect(firstNamesError).not.toBeVisible();

		// Continue typing
		await firstNamesInput.pressSequentially("est", { delay: 50 });

		// Still no error while typing
		await expect(firstNamesError).not.toBeVisible();

		// Restore original value
		await firstNamesInput.fill(originalValue);
	});

	test("should show validation errors on blur for empty required field", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/settings/profile", { locale: "fi" }), { waitUntil: "networkidle" });

		const firstNamesInput = adminPage.getByTestId("firstNames-input");
		const firstNamesError = adminPage.getByTestId("firstNames-error");
		const lastNameInput = adminPage.getByTestId("lastName-input");

		// Get original value
		const originalValue = await firstNamesInput.inputValue();

		// Clear the field
		await firstNamesInput.clear();

		// No error yet (haven't blurred)
		await expect(firstNamesError).not.toBeVisible();

		// Blur by clicking another field
		await lastNameInput.click();

		// Now error should be visible after blur
		await expect(firstNamesError).toBeVisible();

		// Restore original value
		await firstNamesInput.fill(originalValue);
		await lastNameInput.click(); // Blur to trigger validation
	});

	test("should validate on input after initial validation (reward early)", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/settings/profile", { locale: "fi" }), { waitUntil: "networkidle" });

		const firstNamesInput = adminPage.getByTestId("firstNames-input");
		const firstNamesError = adminPage.getByTestId("firstNames-error");
		const lastNameInput = adminPage.getByTestId("lastName-input");

		// Get original value
		const originalValue = await firstNamesInput.inputValue();

		// Clear the field and blur to trigger initial validation
		await firstNamesInput.clear();
		await lastNameInput.click(); // Blur to trigger validation

		// Error should now be visible
		await expect(firstNamesError).toBeVisible();

		// Now type in the field - error should disappear as we fix it (validates on input now)
		await firstNamesInput.click();
		await firstNamesInput.pressSequentially("Test", { delay: 50 });

		// Error should disappear while typing (reward early - immediate feedback when fixing)
		await expect(firstNamesError).not.toBeVisible();

		// Restore original value
		await firstNamesInput.fill(originalValue);
		await lastNameInput.click();
	});

	test("should show error again if field becomes invalid after being valid", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/settings/profile", { locale: "fi" }), { waitUntil: "networkidle" });

		const firstNamesInput = adminPage.getByTestId("firstNames-input");
		const firstNamesError = adminPage.getByTestId("firstNames-error");
		const lastNameInput = adminPage.getByTestId("lastName-input");

		// Get original value
		const originalValue = await firstNamesInput.inputValue();

		// Clear, blur to validate, then fix
		await firstNamesInput.clear();
		await lastNameInput.click();
		await expect(firstNamesError).toBeVisible();

		// Fix the error
		await firstNamesInput.fill("Valid");
		await expect(firstNamesError).not.toBeVisible();

		// Clear again - since we're in "validated" mode, it should show error on input
		await firstNamesInput.clear();

		// Error should appear immediately (validates on input after initial validation)
		await expect(firstNamesError).toBeVisible();

		// Restore original value
		await firstNamesInput.fill(originalValue);
		await lastNameInput.click();
	});
});
