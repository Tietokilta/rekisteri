import { test, expect } from "./fixtures/auth";

test.describe("Authentication", () => {
	test("admin page fixture can access admin members page", async ({ adminPage }) => {
		// Navigate to admin members page which requires authentication
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Verify we're on the admin members page (handles i18n routes)
		// and not redirected to sign-in page
		await expect(adminPage).toHaveURL(/\/(hallinta\/jasenet|admin\/members)/);
		await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);
	});

	test("authenticated admin can see user profile on home page", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Verify we're not redirected to sign-in
		await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);

		// Check for readonly email input (indicates authenticated user viewing their profile)
		const emailInput = adminPage.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
		await expect(emailInput).toHaveValue("root@tietokilta.fi");
	});
});
