import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Admin Workflow Tests
 *
 * Tests complete admin workflows through the UI.
 *
 * Refactored to use:
 * - testData fixture for automatic cleanup
 * - Robust data-testid selectors
 * - Proper wait conditions
 */

test.describe("Admin Members Management", () => {
	test("admin can view members list with filtering", async ({ adminPage, testData }) => {
		// Create a specific test user to search for
		const user = await testData.createUser({
			firstNames: "SearchTest",
			lastName: `User${Date.now()}`,
			email: `search-test-${Date.now()}@example.com`,
			isAdmin: false,
		});

		await testData.createMember({
			userId: user.id,
			status: "active",
		});

		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Verify: Page loads correctly
		await expect(adminPage).toHaveURL(/admin\/members/);
		await expect(adminPage.locator("table")).toBeVisible();

		// Verify: Can search for our test user
		const searchInput = adminPage.locator('input[type="search"]').first();
		await searchInput.fill(user.lastName);

		// Wait for URL to update
		await expect(adminPage).toHaveURL(new RegExp(`search=${user.lastName}`));

		// Verify: Our test user appears in results using robust selector
		const testUserRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(testUserRow).toBeVisible();

		// Test filter persistence: reload page
		await adminPage.reload({ waitUntil: "networkidle" });
		await expect(searchInput).toHaveValue(user.lastName);
		await expect(testUserRow).toBeVisible();

		// Automatic cleanup via testData fixture!
	});

	test("admin can approve member and verify status change", async ({ adminPage, testData }) => {
		// Create fresh test data using testData fixture
		const user = await testData.createUser({
			firstNames: "E2E",
			lastName: "ApprovalTest",
			isAdmin: false,
		});

		const member = await testData.createMember({
			userId: user.id,
			status: "awaiting_approval",
		});

		// Navigate to members list
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Find the test member row using robust selector
		const testMemberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(testMemberRow).toBeVisible();

		// Expand the row using robust selector
		const expandButton = adminPage.getByTestId(`expand-member-${user.id}`);
		await expandButton.click();

		// Wait for approve button to appear
		const approveButton = adminPage.getByTestId(`approve-member-${member.id}`);
		await expect(approveButton).toBeVisible({ timeout: 3000 });

		// Click approve
		await approveButton.click();

		// Wait for action to complete
		await adminPage.waitForLoadState("networkidle");

		// Verify: Database status updated
		const updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});

		expect(updatedMember?.status).toBe("active");

		// Verify: UI reflects change after reload
		await adminPage.reload({ waitUntil: "networkidle" });
		const memberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(memberRow).toBeVisible();

		// Automatic cleanup via testData fixture!
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

		// Create a membership using form
		const uniqueType = `E2E Test ${Date.now()}`;
		const uniquePriceId = `price_e2e_${Date.now()}`;

		await adminPage.locator('input[name="type"]').fill(uniqueType);
		await adminPage.locator('input[name="stripePriceId"]').fill(uniquePriceId);
		await adminPage.locator('input[name="startTime"]').fill("2026-01-01");
		await adminPage.locator('input[name="endTime"]').fill("2026-12-31");
		await adminPage.locator('input[name="priceCents"]').fill("9999");

		// Submit form
		const submitButton = adminPage.locator('form[action*="createMembership"] button[type="submit"]');
		await submitButton.click();

		// Wait for creation - verify new membership appears
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
