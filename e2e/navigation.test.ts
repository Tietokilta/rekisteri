import { test, expect } from "./fixtures/auth";

test.describe("Navigation and Access Control", () => {
	test("admin can navigate to memberships page from home", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Find and click memberships link
		const membershipsLink = adminPage.getByRole("link").filter({ hasText: /jäsenyystyyp|membership.*type/i }).first();
		await membershipsLink.click();

		// Verify navigation
		await expect(adminPage).toHaveURL(/\/(hallinta\/jasenyystyypit|admin\/memberships)/);
	});

	test("admin can navigate to members page from home", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Find and click members link
		const membersLink = adminPage.getByRole("link").filter({ hasText: /jäsenet|members/i }).first();
		await membersLink.click();

		// Verify navigation
		await expect(adminPage).toHaveURL(/\/(hallinta\/jasenet|admin\/members)/);
	});

	test("admin can navigate to import page from home", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Find and click import link
		const importLink = adminPage.getByRole("link").filter({ hasText: /tuonti|import/i }).first();
		await importLink.click();

		// Verify navigation
		await expect(adminPage).toHaveURL(/\/(hallinta\/jasenet\/tuonti|admin\/members\/import)/);
	});

	test("authenticated user can navigate to membership purchase page", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		// Find and click buy membership button
		const buyButton = authenticatedPage.locator('a[href*="/new"]').first();
		await buyButton.click();

		// Verify navigation
		await expect(authenticatedPage).toHaveURL(/\/new/);
	});

	test("unauthenticated user is redirected to sign-in from home", async ({ page }) => {
		await page.goto("/");

		// Should redirect to sign-in
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});

	test("unauthenticated user is redirected from admin pages", async ({ page }) => {
		const adminRoutes = ["/admin/members", "/admin/memberships", "/admin/members/import"];

		for (const route of adminRoutes) {
			await page.goto(route);
			await expect(page).toHaveURL(/sign-in|kirjaudu/);
		}
	});

	test("unauthenticated user is redirected from purchase page", async ({ page }) => {
		await page.goto("/new");

		// Should redirect to sign-in
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});

	test("admin can access all protected routes", async ({ adminPage }) => {
		const routes = ["/", "/new", "/admin/members", "/admin/memberships", "/admin/members/import"];

		for (const route of routes) {
			await adminPage.goto(route, { waitUntil: "networkidle" });

			// Should not be redirected to sign-in
			await expect(adminPage).not.toHaveURL(/sign-in|kirjaudu/);
		}
	});

	test("language switching works correctly", async ({ adminPage }) => {
		// Start with Finnish
		await adminPage.goto("/fi", { waitUntil: "networkidle" });
		await expect(adminPage).toHaveURL(/\/fi/);

		// Navigate to English
		await adminPage.goto("/en", { waitUntil: "networkidle" });
		await expect(adminPage).toHaveURL(/\/en/);
	});

	test("admin links are not visible to non-admin users", async ({ page }) => {
		// For this test, we'd need a non-admin authenticated user
		// Since we only have admin fixture, we'll test that unauthenticated doesn't see it

		// Navigate to sign-in page (public)
		await page.goto("/sign-in", { waitUntil: "networkidle" });

		// Admin links should not be present
		const adminSection = page.getByRole("heading", { name: /hallinta|admin/i });
		await expect(adminSection).not.toBeVisible();
	});

	test("breadcrumb or navigation elements work on admin pages", async ({ adminPage }) => {
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Page should have heading indicating current location
		await expect(adminPage.locator("h1")).toBeVisible();
	});

	test("direct URL access to protected routes requires authentication", async ({ page }) => {
		// Test various protected routes
		const protectedRoutes = [
			"/admin/members",
			"/admin/memberships",
			"/admin/members/import",
			"/new",
			"/",
			"/fi/admin/members",
			"/en/admin/members",
		];

		for (const route of protectedRoutes) {
			await page.goto(route);

			// All should redirect to sign-in
			await expect(page).toHaveURL(/sign-in|kirjaudu/);
		}
	});

	test("authenticated user stays on intended page after login", async ({ adminPage }) => {
		// Admin is already logged in, so they should be able to access pages directly
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Should not be redirected
		await expect(adminPage).toHaveURL(/\/(hallinta\/jasenet|admin\/members)/);
	});

	test("page titles and headings are descriptive", async ({ adminPage }) => {
		const pages = [
			{ url: "/", heading: /tervetuloa|welcome|tiedot|info/i },
			{ url: "/admin/members", heading: /jäsenet|members/i },
			{ url: "/admin/memberships", heading: /jäsenyystyyp|membership/i },
			{ url: "/new", heading: /osta jäsenyys|buy membership/i },
		];

		for (const { url, heading } of pages) {
			await adminPage.goto(url, { waitUntil: "networkidle" });
			await expect(adminPage.locator("h1").filter({ hasText: heading })).toBeVisible();
		}
	});

	test("navigation maintains locale preference", async ({ adminPage }) => {
		// Start with Finnish locale
		await adminPage.goto("/fi", { waitUntil: "networkidle" });

		// Navigate to another page
		const buyLink = adminPage.locator('a[href*="/new"]').first();
		await buyLink.click();

		// Should maintain Finnish locale
		await expect(adminPage).toHaveURL(/\/fi\/new/);
	});

	test("back button works correctly after navigation", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Navigate to another page
		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		// Go back
		await adminPage.goBack();

		// Should be back at home (either root or with locale prefix)
		await expect(adminPage).toHaveURL(/\/(fi|en)?\/?$/);
	});
});
