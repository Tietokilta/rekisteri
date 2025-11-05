import { test, expect } from "./fixtures/auth";

test.describe("Membership Purchase Flow", () => {
	test("user can view available memberships on purchase page", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Verify page loaded and shows membership options
		await expect(authenticatedPage.getByText(/Osta jäsenyys|Buy membership/i)).toBeVisible();

		// Check that at least one membership option is visible
		const membershipOptions = authenticatedPage.locator('input[type="radio"][name="membershipId"]');
		await expect(membershipOptions.first()).toBeVisible();
	});

	test("user can select a membership option", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Select first membership option
		const firstOption = authenticatedPage.locator('input[type="radio"][name="membershipId"]').first();
		await firstOption.click();

		// Verify it's selected
		await expect(firstOption).toBeChecked();
	});

	test("student verification checkbox appears for student memberships", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Find a membership that requires student verification
		const studentMembership = authenticatedPage.locator('label:has(input[type="radio"])').filter({
			hasText: /opiskelija|student/i,
		});

		if ((await studentMembership.count()) > 0) {
			// Click the student membership
			await studentMembership.first().click();

			// Check if student verification checkbox appears
			const studentCheckbox = authenticatedPage.locator('input[type="checkbox"][name="isStudent"]');

			// If the membership requires student verification, the checkbox should be visible
			if ((await studentCheckbox.count()) > 0) {
				await expect(studentCheckbox).toBeVisible();
			}
		}
	});

	test("buy button is disabled when student verification is required but not checked", async ({
		authenticatedPage,
	}) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Find a membership that requires student verification
		const studentMembership = authenticatedPage.locator('label:has(input[type="radio"])').filter({
			hasText: /opiskelija|student/i,
		});

		if ((await studentMembership.count()) > 0) {
			await studentMembership.first().click();

			// Check if student checkbox exists
			const studentCheckbox = authenticatedPage.locator('input[type="checkbox"][name="isStudent"]');

			if ((await studentCheckbox.count()) > 0) {
				// Uncheck if checked
				if (await studentCheckbox.isChecked()) {
					await studentCheckbox.uncheck();
				}

				// Buy button should be disabled
				const buyButton = authenticatedPage.locator('button[type="submit"]');
				await expect(buyButton).toBeDisabled();
			}
		}
	});

	test("buy button shows selected membership price", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Select first membership
		const firstOption = authenticatedPage.locator('input[type="radio"][name="membershipId"]').first();
		await firstOption.click();

		// Get the price from the label
		const label = firstOption.locator("../..");
		const labelText = await label.textContent();
		const priceMatch = labelText?.match(/(\d+)\s*€/);

		if (priceMatch) {
			const price = priceMatch[1];
			// Verify button shows the price
			const buyButton = authenticatedPage.locator('button[type="submit"]');
			await expect(buyButton).toContainText(price);
		}
	});

	test("unauthenticated user is redirected from purchase page", async ({ page }) => {
		await page.goto("/new");

		// Should be redirected to sign-in page
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});
});
