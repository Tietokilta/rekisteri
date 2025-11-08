import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Admin Workflow Tests
 */

test.describe("Admin Members Management", () => {
	test("admin can view members list with filtering", async ({ adminPage, testData }) => {
		const lastName = `User${Date.now()}`;
		const user = await testData.createUser({
			firstNames: "SearchTest",
			lastName,
			email: `search-test-${Date.now()}@example.com`,
			isAdmin: false,
		});

		await testData.createMember({
			userId: user.id,
			status: "active",
		});

		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });
		await expect(adminPage).toHaveURL(/admin\/members/);
		await expect(adminPage.locator("table")).toBeVisible();

		const searchInput = adminPage.locator('input[type="search"]').first();
		await searchInput.fill(lastName);
		await expect(adminPage).toHaveURL(new RegExp(`search=${lastName}`));

		const testUserRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(testUserRow).toBeVisible();

		await adminPage.reload({ waitUntil: "networkidle" });
		await expect(searchInput).toHaveValue(lastName);
		await expect(testUserRow).toBeVisible();
	});

	test("admin can approve member and verify status change", async ({ adminPage, testData }) => {
		const user = await testData.createUser({
			firstNames: "E2E",
			lastName: "ApprovalTest",
			isAdmin: false,
		});

		const member = await testData.createMember({
			userId: user.id,
			status: "awaiting_approval",
		});

		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		const testMemberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(testMemberRow).toBeVisible();

		const expandButton = adminPage.getByTestId(`expand-member-${user.id}`);
		await expandButton.click();

		const approveButton = adminPage.getByTestId(`approve-member-${member.id}`);
		await expect(approveButton).toBeVisible({ timeout: 3000 });
		await approveButton.click();

		await adminPage.waitForLoadState("networkidle");

		const updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("active");

		await adminPage.reload({ waitUntil: "networkidle" });
		const memberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(memberRow).toBeVisible();
	});
});

test.describe("Admin Memberships Management", () => {
	test("admin can view and create membership", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		await expect(adminPage).toHaveURL(/admin\/memberships/);
		await expect(adminPage.locator("ul.space-y-4")).toBeVisible();
		await expect(adminPage.getByText(/luo uusi|create new/i)).toBeVisible();

		const uniqueType = `E2E Test ${Date.now()}`;
		const uniquePriceId = `price_e2e_${Date.now()}`;

		await adminPage.locator('input[name="type"]').fill(uniqueType);
		await adminPage.locator('input[name="stripePriceId"]').fill(uniquePriceId);
		await adminPage.locator('input[name="startTime"]').fill("2026-01-01");
		await adminPage.locator('input[name="endTime"]').fill("2026-12-31");
		await adminPage.locator('input[name="priceCents"]').fill("9999");

		const submitButton = adminPage.locator('form[action*="createMembership"] button[type="submit"]');
		await submitButton.click();

		await expect(adminPage.getByText(uniqueType)).toBeVisible({ timeout: 5000 });

		const testMembership = await db.query.membership.findFirst({
			where: eq(table.membership.type, uniqueType),
		});

		if (testMembership) {
			await db.delete(table.membership).where(eq(table.membership.id, testMembership.id));
		}
	});
});
