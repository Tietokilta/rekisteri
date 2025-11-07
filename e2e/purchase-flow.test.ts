import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Membership Purchase Flow Tests
 *
 * Tests the complete membership purchase workflow from selection to Stripe redirect.
 *
 * Refactored to use:
 * - testData fixture for automatic cleanup
 * - Robust data-testid selectors (no parent traversal!)
 * - Proper wait conditions
 */

test.describe("Membership Purchase Flow", () => {
	test("user can select membership and initiate purchase", async ({ authenticatedPage, testData }) => {
		// Get initial member count for the test user
		const user = await testData.createUser({
			email: "purchase-test@example.com",
			isAdmin: false,
		});

		const initialMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user.id),
		});
		const initialCount = initialMembers.length;

		// Navigate to purchase page
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Verify: Page shows available memberships
		await expect(authenticatedPage.getByText(/osta jäsenyys|buy membership/i)).toBeVisible();

		// Get all available memberships
		const availableMemberships = await db.query.membership.findMany();
		expect(availableMemberships.length).toBeGreaterThan(0);

		const firstMembership = availableMemberships[0];
		if (!firstMembership) throw new Error("No membership available for test");

		// Verify: Membership shows price and dates using robust selector
		const membershipLabel = authenticatedPage.getByTestId(`membership-option-${firstMembership.id}`);
		await expect(membershipLabel).toBeVisible();

		const labelText = await membershipLabel.textContent();
		expect(labelText).toMatch(/\d+([.,]\d{2})?\s*€/); // Price in euros
		expect(labelText).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/); // Date format

		// Select membership using robust selector
		const membershipRadio = authenticatedPage.getByTestId(`membership-radio-${firstMembership.id}`);
		await membershipRadio.click();
		await expect(membershipRadio).toBeChecked();

		// Submit purchase using robust selector
		const submitButton = authenticatedPage.getByTestId("purchase-submit-button");
		await expect(submitButton).toBeEnabled();
		await submitButton.click();

		// Verify: Redirects to Stripe Checkout
		await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/, { timeout: 10_000 });

		// Verify: Member record created with awaiting_payment status
		const newMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user.id),
			orderBy: desc(table.member.createdAt),
		});

		expect(newMembers.length).toBe(initialCount + 1);

		const newMember = newMembers[0];
		expect(newMember?.status).toBe("awaiting_payment");
		expect(newMember?.stripeSessionId).toMatch(/^cs_/);

		// Automatic cleanup via testData fixture!
	});

	test("student verification is enforced for student memberships", async ({ authenticatedPage, testData }) => {
		await testData.createUser({
			email: "student-test@example.com",
			isAdmin: false,
		});

		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Find student membership from database
		const studentMembership = await db.query.membership.findFirst({
			where: eq(table.membership.requiresStudentVerification, true),
		});

		// Only run test if student membership exists
		if (!studentMembership) {
			console.log("⚠️  Skipping student verification test - no student membership configured");
			return;
		}

		// Select student membership using robust selector
		const studentRadio = authenticatedPage.getByTestId(`membership-radio-${studentMembership.id}`);
		await studentRadio.click();
		await expect(studentRadio).toBeChecked();

		// Find student checkbox using robust selector
		const studentCheckbox = authenticatedPage.getByTestId("student-verification-checkbox");
		await expect(studentCheckbox).toBeVisible();

		// Uncheck if checked
		if (await studentCheckbox.isChecked()) {
			await studentCheckbox.click();
		}

		// Verify: Submit button disabled without verification
		const submitButton = authenticatedPage.getByTestId("purchase-submit-button");
		await expect(submitButton).toBeDisabled();

		// Check the verification box
		await studentCheckbox.click();
		await expect(studentCheckbox).toBeChecked();

		// Verify: Submit button enabled with verification
		await expect(submitButton).toBeEnabled();

		// Automatic cleanup via testData fixture!
	});

	test("handles payment success and cancel redirects", async ({ authenticatedPage, testData }) => {
		await testData.createUser({
			email: "redirect-test@example.com",
			isAdmin: false,
		});

		// Test success redirect
		await authenticatedPage.goto("/?stripeStatus=success", { waitUntil: "networkidle" });
		await expect(authenticatedPage).toHaveURL(/stripeStatus=success/);
		await expect(authenticatedPage.locator('input[type="email"]').first()).toBeVisible();

		// Test cancel redirect
		await authenticatedPage.goto("/?stripeStatus=cancel", { waitUntil: "networkidle" });
		await expect(authenticatedPage).toHaveURL(/stripeStatus=cancel/);
		await expect(authenticatedPage.locator('input[type="email"]').first()).toBeVisible();

		// Automatic cleanup via testData fixture!
	});

	test("unauthenticated users cannot access purchase page", async ({ page }) => {
		await page.goto("/new");
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});
});
