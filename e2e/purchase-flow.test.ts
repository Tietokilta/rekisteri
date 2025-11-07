import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Membership Purchase Flow Tests
 *
 * Tests the complete membership purchase workflow from selection to Stripe redirect.
 * Consolidated from membership-purchase.test.ts (6 tests) + stripe-integration.test.ts (8 tests).
 * Focus: Critical purchase flow, not redundant UI checks.
 */

test.describe("Membership Purchase Flow", () => {
	test("user can select membership and initiate purchase", async ({ authenticatedPage }) => {
		// Get user's current member count
		const userEmail = "test@example.com"; // Use test fixture user
		let user = await db.query.user.findFirst({
			where: eq(table.user.email, userEmail),
		});

		// Create test user if doesn't exist
		if (!user) {
			await db.insert(table.user).values({
				id: crypto.randomUUID(),
				email: userEmail,
				isAdmin: false,
			});
			user = await db.query.user.findFirst({
				where: eq(table.user.email, userEmail),
			});
		}
		if (!user) throw new Error("Failed to create or find test user");

		const initialMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user.id),
		});
		const initialCount = initialMembers.length;

		// Navigate to purchase page
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Verify: Page shows available memberships
		await expect(authenticatedPage.getByText(/osta jäsenyys|buy membership/i)).toBeVisible();

		const membershipOptions = authenticatedPage.locator('input[type="radio"][name="membershipId"]');
		const count = await membershipOptions.count();
		expect(count).toBeGreaterThan(0);

		// Verify: First membership shows price and dates
		const firstLabel = membershipOptions.first().locator("../..");
		const labelText = await firstLabel.textContent();
		expect(labelText).toMatch(/\d+([.,]\d{2})?\s*€/); // Price in euros
		expect(labelText).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/); // Date format

		// Select membership
		await membershipOptions.first().click();
		await expect(membershipOptions.first()).toBeChecked();

		// Submit purchase
		const submitButton = authenticatedPage.locator('button[type="submit"]');
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

		// Cleanup
		if (newMember) {
			await db.delete(table.member).where(eq(table.member.id, newMember.id));
		}
	});

	test("student verification is enforced for student memberships", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		// Find student membership (if available)
		const studentMembership = authenticatedPage.locator('label:has(input[type="radio"])').filter({
			hasText: /opiskelija|student/i,
		});

		if ((await studentMembership.count()) > 0) {
			await studentMembership.first().click();

			const studentCheckbox = authenticatedPage.locator('input[type="checkbox"][name="isStudent"]');

			if ((await studentCheckbox.count()) > 0) {
				// Verify: Checkbox visible and required
				await expect(studentCheckbox).toBeVisible();

				// Uncheck if checked
				if (await studentCheckbox.isChecked()) {
					await studentCheckbox.click();
				}

				// Verify: Buy button disabled without verification
				const buyButton = authenticatedPage.locator('button[type="submit"]');
				await expect(buyButton).toBeDisabled();

				// Check the box
				await studentCheckbox.click();

				// Verify: Buy button enabled with verification
				await expect(buyButton).toBeEnabled();
			}
		}
	});

	test("handles payment success and cancel redirects", async ({ authenticatedPage }) => {
		// Test success redirect
		await authenticatedPage.goto("/?stripeStatus=success", { waitUntil: "networkidle" });
		await expect(authenticatedPage).toHaveURL(/stripeStatus=success/);
		await expect(authenticatedPage.locator('input[type="email"]').first()).toBeVisible();

		// Test cancel redirect
		await authenticatedPage.goto("/?stripeStatus=cancel", { waitUntil: "networkidle" });
		await expect(authenticatedPage).toHaveURL(/stripeStatus=cancel/);
		await expect(authenticatedPage.locator('input[type="email"]').first()).toBeVisible();
	});

	test("unauthenticated users cannot access purchase page", async ({ page }) => {
		await page.goto("/new");
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});
});
