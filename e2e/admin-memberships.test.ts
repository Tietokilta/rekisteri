import { test, expect } from "./fixtures/auth";

test.describe("Admin Memberships Management", () => {
	test("admin can view memberships list", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Verify page loaded
		await expect(adminPage).toHaveURL(/\/(hallinta\/jasenyystyypit|admin\/memberships)/);
		await expect(adminPage.getByRole("heading", { name: /jäsenyydet|memberships/i }).first()).toBeVisible();

		// Check that membership list is visible
		const membershipList = adminPage.locator("ul.space-y-4");
		await expect(membershipList).toBeVisible();
	});

	test("admin can see membership details", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Find membership items
		const membershipItems = adminPage.locator("li.rounded-md.border");
		const count = await membershipItems.count();

		if (count > 0) {
			const firstMembership = membershipItems.first();

			// Should show membership type
			await expect(firstMembership.locator("p.font-medium")).toBeVisible();

			// Should show date range with time elements
			await expect(firstMembership.locator("time").first()).toBeVisible();

			// Should show Stripe price ID
			await expect(firstMembership.getByText(/price_/)).toBeVisible();
		}
	});

	test("admin can access membership creation form", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Verify creation form is visible
		await expect(adminPage.getByText(/luo uusi|create new/i)).toBeVisible();

		// Check all form fields exist
		await expect(adminPage.locator('input[name="type"]')).toBeVisible();
		await expect(adminPage.locator('input[name="stripePriceId"]')).toBeVisible();
		await expect(adminPage.locator('input[name="startTime"]')).toBeVisible();
		await expect(adminPage.locator('input[name="endTime"]')).toBeVisible();
		await expect(adminPage.locator('input[name="priceCents"]')).toBeVisible();
		await expect(adminPage.locator('input[name="requiresStudentVerification"]')).toBeVisible();
	});

	test("membership creation form validates required fields", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Try submitting empty form
		const submitButton = adminPage.locator('form[action*="createMembership"] button[type="submit"]');
		await submitButton.click();

		// HTML5 validation should prevent submission
		// Check if required fields have the required attribute
		await expect(adminPage.locator('input[name="type"]')).toHaveAttribute("required", "");
		await expect(adminPage.locator('input[name="stripePriceId"]')).toHaveAttribute("required", "");
	});

	test("admin can fill out membership creation form", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Fill in the form
		await adminPage.locator('input[name="type"]').fill("Test Membership");
		await adminPage.locator('input[name="stripePriceId"]').fill("price_test123");
		await adminPage.locator('input[name="startTime"]').fill("2025-01-01");
		await adminPage.locator('input[name="endTime"]').fill("2025-12-31");
		await adminPage.locator('input[name="priceCents"]').fill("5000");

		// Verify values are filled
		await expect(adminPage.locator('input[name="type"]')).toHaveValue("Test Membership");
		await expect(adminPage.locator('input[name="stripePriceId"]')).toHaveValue("price_test123");
		await expect(adminPage.locator('input[name="priceCents"]')).toHaveValue("5000");
	});

	test("admin can see delete button for memberships with no members", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Look for memberships showing "0" members
		const zeroMemberText = adminPage.getByText(/0.*jäsen|0.*member/i);

		if ((await zeroMemberText.count()) > 0) {
			// Find the parent membership item
			const membershipItem = zeroMemberText.first().locator("..");

			// Should have a delete button
			const deleteButton = membershipItem.locator('button[type="submit"]', { hasText: /poista|delete/i });
			await expect(deleteButton).toBeVisible();
		}
	});

	test("non-admin user cannot access memberships management page", async ({ page }) => {
		// Try to access without authentication
		await page.goto("/admin/memberships");

		// Should be redirected to sign-in
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});

	test("membership type datalist provides suggestions", async ({ adminPage }) => {
		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		// Check that datalist exists with options
		const datalist = adminPage.locator("datalist#types");
		await expect(datalist).toBeAttached();

		// Should have at least one option
		const options = datalist.locator("option");
		const count = await options.count();
		expect(count).toBeGreaterThan(0);
	});
});
