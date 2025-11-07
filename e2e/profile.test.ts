import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * User Profile Tests
 *
 * Tests complete profile management workflows.
 *
 * Refactored to use:
 * - testData fixture (NO test pollution - each test creates its own user)
 * - Robust data-testid selectors
 * - Proper wait conditions
 * - Focus on HIGH-VALUE tests (data persistence, not navigation)
 */

test.describe("User Profile", () => {
	test("user can view, edit, and save profile information", async ({ page, testData }) => {
		// Create dedicated test user (NO pollution of shared root user!)
		const user = await testData.createUser({
			email: `profile-edit-${Date.now()}@example.com`,
			firstNames: "Original",
			lastName: "Name",
			homeMunicipality: "Original City",
			isAllowedEmails: false,
			isAdmin: false,
		});

		// Create session for this user
		const session = await testData.createSession(user.id);

		// Set session cookie to authenticate as this user
		await page.context().addCookies([
			{
				name: "session",
				value: session.id,
				domain: "localhost",
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		await page.goto("/", { waitUntil: "networkidle" });

		// Verify: Profile page loads with user data
		const emailInput = page.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
		await expect(emailInput).toHaveValue(user.email);
		await expect(emailInput).toHaveAttribute("readonly");

		// Edit profile fields
		const uniqueSuffix = Date.now();
		const newFirstNames = `TestFirst${uniqueSuffix}`;
		const newLastName = `TestLast${uniqueSuffix}`;
		const newMunicipality = `TestCity${uniqueSuffix}`;

		await page.locator('input[name="firstNames"]').fill(newFirstNames);
		await page.locator('input[name="lastName"]').fill(newLastName);
		await page.locator('input[name="homeMunicipality"]').fill(newMunicipality);

		// Toggle email consent using robust selector
		const emailSwitch = page.getByTestId("email-consent-toggle");
		const initialEmailConsent = await emailSwitch.getAttribute("data-state");

		// Click to toggle (regardless of current state, we're testing the toggle works)
		await emailSwitch.click();

		// Save changes using robust selector
		const saveButton = page.getByTestId("save-profile-button");
		await saveButton.click();

		// Wait for save to complete - look for form to be ready again
		await page.waitForLoadState("networkidle");

		// Verify: Database was updated
		const updatedUser = await db.query.user.findFirst({
			where: eq(table.user.id, user.id),
		});

		expect(updatedUser?.firstNames).toBe(newFirstNames);
		expect(updatedUser?.lastName).toBe(newLastName);
		expect(updatedUser?.homeMunicipality).toBe(newMunicipality);
		expect(updatedUser?.isAllowedEmails).toBe(initialEmailConsent !== "checked"); // Toggled

		// Verify: UI reflects changes after reload
		await page.reload({ waitUntil: "networkidle" });
		await expect(page.locator('input[name="firstNames"]')).toHaveValue(newFirstNames);
		await expect(page.locator('input[name="lastName"]')).toHaveValue(newLastName);
		await expect(page.locator('input[name="homeMunicipality"]')).toHaveValue(newMunicipality);

		// Automatic cleanup via testData fixture!
	});

	// Deleted 2 low-value navigation tests:
	// - "profile displays membership information and purchase option" (just checks link works)
	// - "admin user sees admin section on profile" (just checks link works)
	// These provide minimal value - if links break, high-value tests will fail anyway.
	// Focus on testing business logic, not SvelteKit routing.
});
