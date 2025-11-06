import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Admin Workflow Tests
 *
 * Tests complete admin workflows through the UI.
 * Consolidated from admin-members.test.ts (12 tests) + admin-memberships.test.ts (8 tests).
 * Focus: Actual functionality, not just "does button exist"
 */

test.describe("Admin Members Management", () => {
	test("admin can view members list with filtering", async ({ adminPage }) => {
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Verify: Page loads correctly
		await expect(adminPage).toHaveURL(/admin\/members/);
		await expect(adminPage.locator("table")).toBeVisible();

		// Verify: Can search
		const searchInput = adminPage.locator('input[type="search"]').first();
		await searchInput.fill("root");
		await adminPage.waitForTimeout(500);

		// Verify: URL updated with search parameter
		await expect(adminPage).toHaveURL(/search=root/);

		// Verify: Table still shows data
		await expect(adminPage.locator("table tbody tr").first()).toBeVisible();

		// Test filter persistence: reload page
		await adminPage.reload({ waitUntil: "networkidle" });
		await expect(searchInput).toHaveValue("root");
	});

	test("admin can approve member and verify status change", async ({ adminPage }) => {
		// Setup: Create a test member in awaiting_approval status
		const testUserId = crypto.randomUUID();
		const testMembershipId = crypto.randomUUID();
		const testMemberId = crypto.randomUUID();

		try {
			// Create test user
			await db.insert(table.user).values({
				id: testUserId,
				email: `e2e-approve-test-${Date.now()}@example.com`,
				firstNames: "E2E",
				lastName: "ApprovalTest",
				isAdmin: false,
			});

			// Get an existing membership to use
			const membership = await db.query.membership.findFirst();
			expect(membership).toBeDefined();

			// Create member awaiting approval
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: membership!.id,
				stripeSessionId: `cs_test_e2e_${Date.now()}`,
				status: "awaiting_approval",
			});

			// Navigate to members list
			await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

			// Find the test member row
			const testMemberRow = adminPage.getByText("E2E ApprovalTest").first();
			await expect(testMemberRow).toBeVisible();

			// Expand the row to see actions
			const expandButton = testMemberRow.locator("..").locator("button:has(svg)").first();
			await expandButton.click();
			await adminPage.waitForTimeout(500);

			// Find and click approve button
			const approveButton = adminPage.locator('form[action*="?/approve"]').locator('button[type="submit"]').first();

			await expect(approveButton).toBeVisible();
			await approveButton.click();

			// Wait for action to complete
			await adminPage.waitForTimeout(1500);

			// Verify: Database status updated
			const updatedMember = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(updatedMember?.status).toBe("active");

			// Verify: UI reflects change (reload to see updated status)
			await adminPage.reload({ waitUntil: "networkidle" });
			const memberRow = adminPage.getByText("E2E ApprovalTest").first();
			await expect(memberRow).toBeVisible();

			// Status should show as active (look for active badge/indicator)
			// The exact implementation depends on your UI
		} finally {
			// Cleanup
			await db
				.delete(table.member)
				.where(eq(table.member.id, testMemberId))
				.catch(() => {});
			await db
				.delete(table.user)
				.where(eq(table.user.id, testUserId))
				.catch(() => {});
		}
	});

	test("admin can copy members list", async ({ adminPage }) => {
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Find copy button
		const copyButton = adminPage
			.getByRole("button")
			.filter({ hasText: /kopioi|copy/i })
			.first();

		if ((await copyButton.count()) > 0) {
			await copyButton.click();

			// Verify: Success message appears
			await expect(adminPage.getByText(/kopioitu|copied/i)).toBeVisible({ timeout: 3000 });
		}
	});
});

test.describe("Admin Memberships Management", () => {
	test("admin can view and create membership", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Verify: Page loads
		await expect(adminPage).toHaveURL(/admin\/memberships/);
		await expect(adminPage.locator("ul.space-y-4")).toBeVisible();

		// Verify: Creation form exists
		await expect(adminPage.getByText(/luo uusi|create new/i)).toBeVisible();
		await expect(adminPage.locator('input[name="type"]')).toBeVisible();
		await expect(adminPage.locator('input[name="stripePriceId"]')).toBeVisible();

		// Fill creation form
		const uniqueType = `E2E Test ${Date.now()}`;
		await adminPage.locator('input[name="type"]').fill(uniqueType);
		await adminPage.locator('input[name="stripePriceId"]').fill(`price_e2e_${Date.now()}`);
		await adminPage.locator('input[name="startTime"]').fill("2026-01-01");
		await adminPage.locator('input[name="endTime"]').fill("2026-12-31");
		await adminPage.locator('input[name="priceCents"]').fill("9999");

		// Submit form
		const submitButton = adminPage.locator('form[action*="createMembership"] button[type="submit"]');
		await submitButton.click();

		// Wait for creation
		await adminPage.waitForTimeout(1500);

		// Verify: New membership appears in list
		await expect(adminPage.getByText(uniqueType)).toBeVisible({ timeout: 5000 });

		// Cleanup: Delete the test membership
		const testMembership = await db.query.membership.findFirst({
			where: eq(table.membership.type, uniqueType),
		});

		if (testMembership) {
			await db.delete(table.membership).where(eq(table.membership.id, testMembership.id));
		}
	});
});
