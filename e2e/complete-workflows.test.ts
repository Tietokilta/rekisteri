import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "../src/lib/server/payment";
import { env } from "../src/lib/server/env";

/**
 * Complete End-to-End Workflow Tests
 *
 * Tests complete user journeys that span multiple components and systems.
 * These are the MOST VALUABLE tests - they verify the entire application works together.
 *
 * Refactored to use:
 * - testData fixture for automatic cleanup
 * - Robust data-testid selectors
 * - Proper wait conditions (no arbitrary timeouts)
 */

test.describe("Complete Workflows", () => {
	test("complete membership lifecycle: purchase → payment → approval → active", async ({ adminPage, testData }) => {
		/**
		 * This test simulates a real user journey:
		 * 1. User purchases membership (simulated by creating member record)
		 * 2. Stripe processes payment (simulated via webhook)
		 * 3. Admin approves membership via UI
		 * 4. Member status becomes active
		 */

		// Step 1: Create test data using fixture (automatic cleanup!)
		const user = await testData.createUser({
			firstNames: "Lifecycle",
			lastName: "Test",
			isAdmin: false,
		});

		const member = await testData.createMember({
			userId: user.id,
			status: "awaiting_payment",
		});

		// Verify initial state
		let updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("awaiting_payment");

		// Step 2: Simulate webhook payment success
		const webhookPayload = JSON.stringify({
			id: `evt_lifecycle_${Date.now()}`,
			type: "checkout.session.completed",
			data: {
				object: {
					id: member.stripeSessionId,
					payment_status: "paid",
				},
			},
		});

		const webhookSignature = stripe.webhooks.generateTestHeaderString({
			payload: webhookPayload,
			secret: env.STRIPE_WEBHOOK_SECRET,
		});

		const webhookRequest = new Request(`${env.PUBLIC_URL}/api/webhook/stripe`, {
			method: "POST",
			body: webhookPayload,
			headers: {
				"content-type": "application/json",
				"stripe-signature": webhookSignature,
			},
		});

		// Process webhook
		const { POST } = await import("../src/routes/api/webhook/stripe/+server.js");
		const webhookResponse = await POST({
			request: webhookRequest,
			url: new URL(webhookRequest.url),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(webhookResponse.status).toBe(200);

		// Verify: Status changed to awaiting_approval
		updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("awaiting_approval");

		// Step 3: Admin approves the member via UI
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Find the test member using robust selector
		const memberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(memberRow).toBeVisible();

		// Expand row using robust selector
		const expandButton = adminPage.getByTestId(`expand-member-${user.id}`);
		await expandButton.click();

		// Wait for expansion animation (check that approve button appears)
		const approveButton = adminPage.getByTestId(`approve-member-${member.id}`);
		await expect(approveButton).toBeVisible({ timeout: 3000 });

		// Approve the member
		await approveButton.click();

		// Wait for the action to complete - verify UI updates
		await expect(memberRow).toBeVisible(); // Row should still be visible
		await adminPage.waitForLoadState("networkidle");

		// Verify: Status changed to active in database
		updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("active");

		// Automatic cleanup via testData fixture!
	});

	test("admin workflow: create membership → verify in purchase page", async ({ adminPage, authenticatedPage }) => {
		/**
		 * Tests that creating a membership makes it immediately available for purchase
		 */

		const timestamp = Date.now();
		const uniqueType = `E2E Workflow ${timestamp}`;
		const uniquePriceId = `price_workflow_${timestamp}`;

		// Step 1: Admin creates membership via UI
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Fill form - these use name selectors as we don't have data-testid on membership form yet
		await adminPage.locator('input[name="type"]').fill(uniqueType);
		await adminPage.locator('input[name="stripePriceId"]').fill(uniquePriceId);
		await adminPage.locator('input[name="startTime"]').fill("2026-06-01");
		await adminPage.locator('input[name="endTime"]').fill("2026-12-31");
		await adminPage.locator('input[name="priceCents"]').fill("12345");

		const submitButton = adminPage.locator('form[action*="createMembership"] button[type="submit"]');
		await submitButton.click();

		// Wait for creation to complete - check that the new membership appears
		await expect(adminPage.getByText(uniqueType)).toBeVisible({ timeout: 5000 });

		// Get the created membership for cleanup
		const createdMembership = await db.query.membership.findFirst({
			where: eq(table.membership.type, uniqueType),
		});
		expect(createdMembership).toBeDefined();
		if (!createdMembership) throw new Error("Membership not created");

		// Track for cleanup
		const cleanupMembershipId = createdMembership.id;

		try {
			// Step 2: Verify appears in purchase page
			await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

			// Should see the new membership
			await expect(authenticatedPage.getByText(uniqueType)).toBeVisible();

			// Should show correct price (123.45 €)
			// Find the membership label using data-testid
			const membershipLabel = authenticatedPage.getByTestId(`membership-option-${createdMembership.id}`);
			await expect(membershipLabel).toBeVisible();
			await expect(membershipLabel).toContainText("123");
		} finally {
			// Manual cleanup (this is a UI-created resource, not from testData)
			await db
				.delete(table.membership)
				.where(eq(table.membership.id, cleanupMembershipId))
				.catch(() => {
					// Ignore cleanup errors
				});
		}
	});
});
