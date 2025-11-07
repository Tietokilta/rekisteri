import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Admin Workflow Tests
 *
 * Tests complete admin workflows through the UI.
 * Consolidated and refactored to use testData fixtures and robust selectors.
 * Focus: Real-world admin workflows with database verification.
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

		// Find the test member row using userId (more reliable than text search)
		const testMemberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(testMemberRow).toBeVisible();

		// Expand the row using robust selector
		const expandButton = adminPage.getByTestId(`expand-member-${user.id}`);
		await expandButton.click();
		await adminPage.waitForTimeout(500);

		// Find and click approve button using robust selector
		const approveButton = adminPage.getByTestId(`approve-member-${member.id}`);
		await expect(approveButton).toBeVisible();
		await approveButton.click();

		// Wait for action to complete
		await adminPage.waitForTimeout(1500);

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
