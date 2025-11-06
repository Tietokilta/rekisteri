import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * E2E Tests: Stripe Integration
 *
 * These tests verify the integration between our app and Stripe:
 * - Creating checkout sessions
 * - Redirecting to Stripe
 * - Handling success/cancel redirects
 * - Database state changes
 *
 * NOTE: We CANNOT test the actual Stripe Checkout form (security restrictions).
 * Those tests are done manually with test cards.
 *
 * See E2E_STRIPE_TESTING.md for full strategy documentation.
 */
test.describe("Stripe Checkout Integration", () => {
	test("submitting purchase redirects to Stripe Checkout", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Select a membership
		const membershipOption = authenticatedPage.locator('input[type="radio"][name="membershipId"]').first();
		await membershipOption.click();

		// Submit purchase form
		const submitButton = authenticatedPage.locator('button[type="submit"]');
		await submitButton.click();

		// Verify: Should redirect to Stripe's hosted checkout
		// This is as far as we can test - Stripe's form cannot be automated
		await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/, {
			timeout: 10000,
		});
	});

	test("creates member record with awaiting_payment status", async ({ adminPage }) => {
		await adminPage.goto("/new", { waitUntil: "networkidle" });

		// Get user's current member count
		const userEmail = "root@tietokilta.fi";
		const user = await db.query.user.findFirst({
			where: eq(table.user.email, userEmail),
		});
		expect(user).toBeDefined();

		const initialMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user!.id),
		});
		const initialCount = initialMembers.length;

		// Start purchase
		const membershipOption = adminPage.locator('input[type="radio"][name="membershipId"]').first();
		await membershipOption.click();
		await adminPage.locator('button[type="submit"]').click();

		// Wait for redirect to Stripe (confirms session was created)
		await expect(adminPage).toHaveURL(/checkout\.stripe\.com/, { timeout: 10000 });

		// Verify: New member record created
		const newMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user!.id),
			orderBy: desc(table.member.createdAt),
		});

		expect(newMembers.length).toBe(initialCount + 1);

		const newMember = newMembers[0];
		expect(newMember).toBeDefined();
		expect(newMember?.status).toBe("awaiting_payment");
		expect(newMember?.stripeSessionId).toBeTruthy();
		expect(newMember?.stripeSessionId).toMatch(/^cs_/); // Stripe session ID format
	});

	test("handles payment success redirect", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/?stripeStatus=success", { waitUntil: "networkidle" });

		// Verify: On home page with success parameter
		await expect(authenticatedPage).toHaveURL(/stripeStatus=success/);

		// Verify: User is still authenticated and can see their profile
		const emailInput = authenticatedPage.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
	});

	test("handles payment cancellation redirect", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/?stripeStatus=cancel", { waitUntil: "networkidle" });

		// Verify: On home page with cancel parameter
		await expect(authenticatedPage).toHaveURL(/stripeStatus=cancel/);

		// Verify: User is still authenticated and can retry purchase
		const emailInput = authenticatedPage.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
	});

	test("only authenticated users can initiate purchase", async ({ page }) => {
		await page.goto("/new");

		// Verify: Redirected to sign-in (access control)
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});

	test("membership selection persists across page interactions", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Select first membership
		const firstOption = authenticatedPage.locator('input[type="radio"][name="membershipId"]').first();
		await firstOption.click();

		// Verify it stays selected
		await expect(firstOption).toBeChecked();

		// Do other interactions
		await authenticatedPage.locator('input[type="email"]').first().focus();

		// Selection should still be maintained
		await expect(firstOption).toBeChecked();
	});
});

test.describe("Membership Display Requirements", () => {
	test("displays available memberships with required information", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Verify page title
		await expect(authenticatedPage.getByRole("heading", { name: /osta jäsenyys|buy membership/i })).toBeVisible();

		// Verify at least one membership available
		const membershipOptions = authenticatedPage.locator('input[type="radio"][name="membershipId"]');
		const count = await membershipOptions.count();
		expect(count).toBeGreaterThan(0);

		// Verify first membership shows price and dates
		const firstLabel = membershipOptions.first().locator("../..");
		const labelText = await firstLabel.textContent();

		// Should show price in euros
		expect(labelText).toMatch(/\d+([.,]\d{2})?\s*€/);

		// Should show date range
		expect(labelText).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/);
	});

	test("enforces student verification requirement", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Find student membership (if available)
		const studentMembership = authenticatedPage.locator('label:has(input[type="radio"])').filter({
			hasText: /opiskelija|student/i,
		});

		if ((await studentMembership.count()) > 0) {
			await studentMembership.first().click();

			const studentCheckbox = authenticatedPage.locator('input[type="checkbox"][name="isStudent"]');

			if ((await studentCheckbox.count()) > 0) {
				// Requirement: Checkbox must be visible for student memberships
				await expect(studentCheckbox).toBeVisible();

				// Requirement: Cannot proceed without verification
				await studentCheckbox.uncheck();
				const buyButton = authenticatedPage.locator('button[type="submit"]');
				await expect(buyButton).toBeDisabled();

				// Requirement: Can proceed with verification
				await studentCheckbox.check();
				await expect(buyButton).toBeEnabled();
			}
		}
	});
});
