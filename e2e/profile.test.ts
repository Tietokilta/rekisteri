import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * User Profile Tests
 *
 * Tests complete profile management workflows.
 * Consolidated from user-profile.test.ts (was 15 tests checking UI exists, now 3 tests verifying functionality).
 */
test.describe("User Profile", () => {
	test("user can view, edit, and save profile information", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Verify: Profile page loads with user data
		const emailInput = adminPage.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
		await expect(emailInput).toHaveValue("root@tietokilta.fi");
		await expect(emailInput).toHaveAttribute("readonly");

		// Get current user from database
		const user = await db.query.user.findFirst({
			where: eq(table.user.email, "root@tietokilta.fi"),
		});
		expect(user).toBeDefined();
		if (!user) throw new Error("User not found");

		// Edit profile fields
		const uniqueSuffix = Date.now();
		const newFirstNames = `TestFirst${uniqueSuffix}`;
		const newLastName = `TestLast${uniqueSuffix}`;
		const newMunicipality = `TestCity${uniqueSuffix}`;

		await adminPage.locator('input[name="firstNames"]').fill(newFirstNames);
		await adminPage.locator('input[name="lastName"]').fill(newLastName);
		await adminPage.locator('input[name="homeMunicipality"]').fill(newMunicipality);

		// Toggle email consent
		const emailSwitch = adminPage.getByTestId("email-consent-toggle");
		const initialEmailConsent = await emailSwitch.getAttribute("data-state");

		await (initialEmailConsent === "checked" ? emailSwitch.click() : emailSwitch.click());

		// Save changes
		const saveButton = adminPage.getByTestId("save-profile-button");
		await saveButton.click();

		// Wait for save to complete (look for success indicator or page reload)
		await adminPage.waitForTimeout(1000);

		// Verify: Database was updated
		const updatedUser = await db.query.user.findFirst({
			where: eq(table.user.id, user.id),
		});

		expect(updatedUser?.firstNames).toBe(newFirstNames);
		expect(updatedUser?.lastName).toBe(newLastName);
		expect(updatedUser?.homeMunicipality).toBe(newMunicipality);
		expect(updatedUser?.isAllowedEmails).toBe(initialEmailConsent !== "checked");

		// Verify: UI reflects changes after reload
		await adminPage.reload({ waitUntil: "networkidle" });
		await expect(adminPage.locator('input[name="firstNames"]')).toHaveValue(newFirstNames);
		await expect(adminPage.locator('input[name="lastName"]')).toHaveValue(newLastName);
		await expect(adminPage.locator('input[name="homeMunicipality"]')).toHaveValue(newMunicipality);
	});

	test("profile displays membership information and purchase option", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		// Verify: Memberships section exists
		const membershipHeading = authenticatedPage.getByRole("heading", { name: /jäsenyydet|membership/i });
		await expect(membershipHeading.first()).toBeVisible();

		// Verify: Buy membership button is accessible - using robust selector
		const buyButton = authenticatedPage.getByTestId("buy-membership-link");
		await expect(buyButton).toBeVisible();

		// Click buy button and verify navigation
		await buyButton.click();
		await expect(authenticatedPage).toHaveURL(/\/new/);
	});

	test("admin user sees admin section on profile", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Verify: Admin section visible
		const adminHeading = adminPage.getByRole("heading", { name: /hallinta|admin/i });
		await expect(adminHeading).toBeVisible();

		// Verify: Admin links present and functional - using robust selector
		const membersLink = adminPage.getByTestId("admin-members-link");
		await expect(membersLink).toBeVisible();

		await membersLink.click();
		await expect(adminPage).toHaveURL(/admin\/members/);
	});
});
