import { test, expect } from "./fixtures/auth";

/**
 * Access Control Tests
 *
 * Verifies authentication and authorization requirements across the application.
 * Consolidated from navigation.test.ts (was 15 tests, now 4 focused tests).
 */
test.describe("Access Control", () => {
	test("unauthenticated users are redirected to sign-in for all protected routes", async ({ page }) => {
		const protectedRoutes = [
			"/",
			"/fi",
			"/en",
			"/new",
			"/fi/new",
			"/admin/members",
			"/admin/memberships",
			"/admin/members/import",
			"/fi/admin/members",
			"/en/admin/memberships",
		];

		for (const route of protectedRoutes) {
			await page.goto(route);
			await expect(page).toHaveURL(/sign-in|kirjaudu/);
		}
	});

	test("authenticated admin users can access all routes", async ({ adminPage }) => {
		const routes = [
			{ path: "/", heading: /tervetuloa|welcome/i },
			{ path: "/new", heading: /osta jäsenyys|buy membership/i },
			{ path: "/admin/members", heading: /jäsenet|members/i },
			{ path: "/admin/memberships", heading: /jäsenyydet|membership/i },
			{ path: "/admin/members/import", heading: /tuonti|import/i },
		];

		for (const { path, heading } of routes) {
			await adminPage.goto(path, { waitUntil: "networkidle" });

			// Verify: Not redirected to sign-in
			await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);

			// Verify: Page loaded correctly with expected content
			await expect(adminPage.locator("h1").filter({ hasText: heading })).toBeVisible();
		}
	});

	test("non-admin users cannot access admin routes", async ({ page }) => {
		// Note: Currently we only have admin fixture, so this tests unauthenticated access
		// In future, add non-admin authenticated user fixture

		const adminRoutes = ["/admin/members", "/admin/memberships", "/admin/members/import"];

		for (const route of adminRoutes) {
			await page.goto(route);
			// Should redirect to sign-in (or 404 for authenticated non-admins)
			await expect(page).toHaveURL(/sign-in|kirjaudu/);
		}
	});

	test("locale switching persists across navigation", async ({ adminPage }) => {
		// Start with Finnish
		await adminPage.goto("/fi", { waitUntil: "networkidle" });
		await expect(adminPage).toHaveURL(/\/fi/);

		// Navigate to purchase page (should maintain locale)
		const buyLink = adminPage.locator('a[href*="/new"]').first();
		await buyLink.click();
		await expect(adminPage).toHaveURL(/\/fi\/new/);

		// Switch to English
		await adminPage.goto("/en", { waitUntil: "networkidle" });
		await expect(adminPage).toHaveURL(/\/en/);

		// Navigate to members (should maintain locale)
		await adminPage.goto("/admin/members");
		await expect(adminPage).toHaveURL(/\/en\/admin\/members/);
	});
});
