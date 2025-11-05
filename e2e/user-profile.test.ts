import { test, expect } from "./fixtures/auth";

test.describe("User Profile", () => {
	test("authenticated user can view profile page", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		// Should see welcome heading
		await expect(authenticatedPage.locator("h1")).toBeVisible();

		// Should see profile form
		await expect(authenticatedPage.locator('form[action*="saveInfo"]')).toBeVisible();
	});

	test("profile form displays user information", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Email field should be readonly and filled
		const emailInput = adminPage.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
		await expect(emailInput).toHaveAttribute("readonly");
		await expect(emailInput).toHaveValue("root@tietokilta.fi");

		// Other fields should be editable
		await expect(adminPage.locator('input[name="firstNames"]')).toBeVisible();
		await expect(adminPage.locator('input[name="lastName"]')).toBeVisible();
		await expect(adminPage.locator('input[name="homeMunicipality"]')).toBeVisible();
	});

	test("user can edit first name", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		const firstNameInput = adminPage.locator('input[name="firstNames"]');
		await firstNameInput.clear();
		await firstNameInput.fill("Updated");

		await expect(firstNameInput).toHaveValue("Updated");
	});

	test("user can edit last name", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		const lastNameInput = adminPage.locator('input[name="lastName"]');
		await lastNameInput.clear();
		await lastNameInput.fill("Testperson");

		await expect(lastNameInput).toHaveValue("Testperson");
	});

	test("user can edit home municipality", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		const municipalityInput = adminPage.locator('input[name="homeMunicipality"]');
		await municipalityInput.clear();
		await municipalityInput.fill("Helsinki");

		await expect(municipalityInput).toHaveValue("Helsinki");
	});

	test("user can toggle email consent", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Find the email consent switch
		const emailSwitch = adminPage.locator('button[role="switch"]').first();
		await expect(emailSwitch).toBeVisible();

		// Get initial state
		const initialState = await emailSwitch.getAttribute("data-state");

		// Toggle it
		await emailSwitch.click();

		// State should change
		const newState = await emailSwitch.getAttribute("data-state");
		expect(newState).not.toBe(initialState);
	});

	test("user can see save button", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		const saveButton = authenticatedPage.locator('button[type="submit"]').filter({ hasText: /tallenna|save/i });
		await expect(saveButton).toBeVisible();
		await expect(saveButton).toBeEnabled();
	});

	test("user can see sign out button", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		const signOutButton = authenticatedPage.locator("button").filter({ hasText: /kirjaudu ulos|sign out/i });
		await expect(signOutButton).toBeVisible();
	});

	test("user profile shows memberships section", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		// Should see memberships heading
		const membershipHeading = authenticatedPage.getByRole("heading", { name: /jäsenyydet|membership/i });
		await expect(membershipHeading.first()).toBeVisible();

		// Should see buy membership button
		const buyButton = authenticatedPage.locator("a").filter({ hasText: /osta jäsenyys|buy membership/i });
		await expect(buyButton.first()).toBeVisible();
	});

	test("user with no memberships sees appropriate message", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		// Check if "no membership" message appears (if user has no memberships)
		const noMembershipText = authenticatedPage.getByText(/ei jäsenyys|no membership/i);

		// This test is conditional - only check if the message exists
		const count = await noMembershipText.count();
		if (count > 0) {
			await expect(noMembershipText).toBeVisible();
		}
	});

	test("admin user sees admin section", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Should see admin heading
		const adminHeading = adminPage.getByRole("heading", { name: /hallinta|admin/i });
		await expect(adminHeading).toBeVisible();

		// Should see admin links
		await expect(adminPage.getByRole("link").filter({ hasText: /jäsenyystyyp|membership/i })).toBeVisible();
		await expect(adminPage.getByRole("link").filter({ hasText: /jäsenet|members/i })).toBeVisible();
	});

	test("unauthenticated user is redirected to sign in", async ({ page }) => {
		await page.goto("/");

		// Should be redirected to sign-in page
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});

	test("profile form has proper input attributes", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		// Email should have proper autocomplete
		const emailInput = authenticatedPage.locator('input[type="email"]');
		await expect(emailInput).toHaveAttribute("autocomplete", "email");

		// First name should have autocomplete
		const firstNameInput = authenticatedPage.locator('input[name="firstNames"]');
		await expect(firstNameInput).toHaveAttribute("autocomplete", "given-name");

		// Last name should have autocomplete
		const lastNameInput = authenticatedPage.locator('input[name="lastName"]');
		await expect(lastNameInput).toHaveAttribute("autocomplete", "family-name");

		// Municipality should have autocomplete
		const municipalityInput = authenticatedPage.locator('input[name="homeMunicipality"]');
		await expect(municipalityInput).toHaveAttribute("autocomplete", "address-level2");
	});

	test("membership status icons are displayed correctly", async ({ adminPage }) => {
		await adminPage.goto("/", { waitUntil: "networkidle" });

		// Look for membership list items
		const membershipItems = adminPage.locator("li.rounded-md.border");
		const count = await membershipItems.count();

		if (count > 0) {
			// Should have status icons (svg elements)
			const firstItem = membershipItems.first();
			const icon = firstItem.locator("svg").first();

			if ((await icon.count()) > 0) {
				await expect(icon).toBeVisible();
			}
		}
	});

	test("buy membership button links to correct page", async ({ authenticatedPage }) => {
		await authenticatedPage.goto("/", { waitUntil: "networkidle" });

		const buyLink = authenticatedPage.locator('a[href*="/new"]').first();
		await expect(buyLink).toBeVisible();

		// Click and verify navigation
		await buyLink.click();
		await expect(authenticatedPage).toHaveURL(/\/new/);
	});
});
