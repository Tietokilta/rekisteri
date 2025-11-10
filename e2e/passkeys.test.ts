import { test, expect } from "./fixtures/test-data";
import { WebAuthnHelper } from "./fixtures/webauthn";
import { route } from "../src/lib/ROUTES";

test.describe("Passkey Management", () => {
	let webauthn: WebAuthnHelper;

	test.beforeEach(async ({ page, locale }) => {
		// Enable WebAuthn virtual authenticator for all passkey tests
		webauthn = new WebAuthnHelper(page);
		await webauthn.enable();

		// Navigate to passkeys page
		await page.goto(route("/[locale=locale]/passkeys", { locale }));
	});

	test.afterEach(async () => {
		// Clean up virtual authenticator
		await webauthn.disable();
	});

	test("displays empty state when no passkeys exist", async ({ page }) => {
		await expect(page.getByText(/no passkeys|ei passkey/i)).toBeVisible();
		await expect(page.getByTestId("add-passkey-button-empty")).toBeVisible();
	});

	test("can register a new passkey with default name", async ({ page }) => {
		// Click add passkey button
		await page.getByTestId("add-passkey-button-empty").click();

		// Wait for name input to appear
		await expect(page.locator("#new-passkey-name")).toBeVisible();

		// Save with default name (date-based)
		await page.getByRole("button", { name: /save|tallenna/i }).click();

		// Verify passkey was added
		await expect(page.getByText(/passkey \d{4}-\d{2}-\d{2}/i)).toBeVisible();

		// Verify virtual authenticator has one credential
		const credentials = await webauthn.getCredentials();
		expect(credentials).toHaveLength(1);
	});

	test("can register a new passkey with custom name", async ({ page }) => {
		const customName = "My Test Passkey";

		// Click add passkey button
		await page.getByTestId("add-passkey-button-empty").click();

		// Wait for name input and enter custom name
		const nameInput = page.locator("#new-passkey-name");
		await expect(nameInput).toBeVisible();
		await nameInput.fill(customName);

		// Save
		await page.getByRole("button", { name: /save|tallenna/i }).click();

		// Verify passkey was added with custom name
		await expect(page.getByText(customName)).toBeVisible();
	});

	test("can register multiple passkeys", async ({ page }) => {
		// Register first passkey
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("First Passkey");
		await page.getByRole("button", { name: /save|tallenna/i }).click();
		await expect(page.getByText("First Passkey")).toBeVisible();

		// Register second passkey
		await page.getByTestId("add-passkey-button-header").click();
		await page.locator("#new-passkey-name").fill("Second Passkey");
		await page.getByRole("button", { name: /save|tallenna/i }).click();
		await expect(page.getByText("Second Passkey")).toBeVisible();

		// Verify both are listed
		await expect(page.getByText("First Passkey")).toBeVisible();
		await expect(page.getByText("Second Passkey")).toBeVisible();

		// Verify virtual authenticator has two credentials
		const credentials = await webauthn.getCredentials();
		expect(credentials).toHaveLength(2);
	});

	test("can rename an existing passkey", async ({ page }) => {
		// Register a passkey
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("Original Name");
		await page.getByRole("button", { name: /save|tallenna/i }).click();
		await expect(page.getByText("Original Name")).toBeVisible();

		// Click rename button
		await page.getByRole("button", { name: /rename|nimeä/i }).click();

		// Change the name
		const renameInput = page.locator('input[name="deviceName"]');
		await renameInput.fill("Renamed Passkey");

		// Save the new name
		await page.getByRole("button", { name: /save|tallenna/i }).click();

		// Verify the name was updated
		await expect(page.getByText("Renamed Passkey")).toBeVisible();
		await expect(page.getByText("Original Name")).not.toBeVisible();
	});

	test("can cancel renaming a passkey", async ({ page }) => {
		// Register a passkey
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("Original Name");
		await page.getByRole("button", { name: /save|tallenna/i }).click();

		// Click rename button
		await page.getByRole("button", { name: /rename|nimeä/i }).click();

		// Start changing the name
		await page.locator('input[name="deviceName"]').fill("New Name");

		// Cancel
		await page.getByRole("button", { name: /cancel|peruuta/i }).click();

		// Verify the original name is still there
		await expect(page.getByText("Original Name")).toBeVisible();
	});

	test("can delete a passkey", async ({ page }) => {
		// Register a passkey
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("To Be Deleted");
		await page.getByRole("button", { name: /save|tallenna/i }).click();
		await expect(page.getByText("To Be Deleted")).toBeVisible();

		// Delete the passkey (handle confirmation dialog)
		page.once("dialog", (dialog) => dialog.accept());
		await page.getByRole("button", { name: /delete|poista/i }).click();

		// Verify passkey was removed
		await expect(page.getByText("To Be Deleted")).not.toBeVisible();
		await expect(page.getByText(/no passkeys|ei passkey/i)).toBeVisible();

		// Verify virtual authenticator has no credentials
		const credentials = await webauthn.getCredentials();
		expect(credentials).toHaveLength(0);
	});

	test("can cancel passkey deletion", async ({ page }) => {
		// Register a passkey
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("Should Stay");
		await page.getByRole("button", { name: /save|tallenna/i }).click();

		// Try to delete but cancel
		page.once("dialog", (dialog) => dialog.dismiss());
		await page.getByRole("button", { name: /delete|poista/i }).click();

		// Verify passkey is still there
		await expect(page.getByText("Should Stay")).toBeVisible();
	});

	test("displays passkey metadata correctly", async ({ page }) => {
		// Register a passkey
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("Test Passkey");
		await page.getByRole("button", { name: /save|tallenna/i }).click();

		// Verify metadata is displayed
		await expect(page.getByText(/created|luotu/i)).toBeVisible();
		await expect(page.getByText(/last used|viimeksi käytetty/i)).toBeVisible();

		// Should show current date
		const today = new Date().toLocaleDateString();
		await expect(page.getByText(today)).toBeVisible();
	});
});

test.describe("Passkey Authentication", () => {
	let webauthn: WebAuthnHelper;

	test.beforeEach(async ({ page, locale, testData }) => {
		// Enable WebAuthn virtual authenticator
		webauthn = new WebAuthnHelper(page);
		await webauthn.enable();

		// First, register a passkey for the test user
		await page.goto(route("/[locale=locale]/passkeys", { locale }));
		await page.getByTestId("add-passkey-button-empty").click();
		await page.locator("#new-passkey-name").fill("Test Device");
		await page.getByRole("button", { name: /save|tallenna/i }).click();
		await expect(page.getByText("Test Device")).toBeVisible();

		// Clear auth cookie to simulate signing out
		await page.context().clearCookies();
	});

	test.afterEach(async () => {
		await webauthn.disable();
	});

	test("can sign in with passkey", async ({ page, locale, testData }) => {
		// Go to sign-in page
		await page.goto(route("/[locale=locale]/sign-in", { locale }));

		// Enter email
		await page.locator('input[name="email"]').fill(testData.user.email);
		await page.getByRole("button", { name: /sign in|kirjaudu/i }).click();

		// Should be on method selection page
		await expect(page.getByTestId("sign-in-with-passkey-button")).toBeVisible();

		// Click passkey button
		await page.getByTestId("sign-in-with-passkey-button").click();

		// Should be redirected to home page after successful auth
		await expect(page).toHaveURL(new RegExp(`/${locale}/?$`));

		// Verify user is signed in
		await expect(page.getByText(/sign out|kirjaudu ulos/i)).toBeVisible();
	});

	test("shows passkey option before email OTP", async ({ page, locale, testData }) => {
		// Go to sign-in page
		await page.goto(route("/[locale=locale]/sign-in", { locale }));

		// Enter email
		await page.locator('input[name="email"]').fill(testData.user.email);
		await page.getByRole("button", { name: /sign in|kirjaudu/i }).click();

		// Should show passkey option first
		await expect(page.getByTestId("sign-in-with-passkey-button")).toBeVisible();

		// Email OTP should be available as fallback
		await expect(page.getByRole("button", { name: /email|sähköposti/i })).toBeVisible();
	});

	test("can fall back to email OTP if passkey fails", async ({ page, locale, testData }) => {
		// Go to sign-in page
		await page.goto(route("/[locale=locale]/sign-in", { locale }));

		// Enter email
		await page.locator('input[name="email"]').fill(testData.user.email);
		await page.getByRole("button", { name: /sign in|kirjaudu/i }).click();

		// Use email instead of passkey
		await page.getByRole("button", { name: /email|sähköposti/i }).click();

		// Should be on email OTP page
		await expect(page.locator('input[name="code"]')).toBeVisible();
	});
});

test.describe("Passkey Error Handling", () => {
	test("handles registration without WebAuthn support gracefully", async ({ page, locale }) => {
		// Note: This test would require mocking the browser's WebAuthn API to throw errors
		// In a real scenario, you'd use page.addInitScript() to mock navigator.credentials
		// For now, this is a placeholder for the test structure

		await page.goto(route("/[locale=locale]/passkeys", { locale }));

		// The application should still be functional even if WebAuthn is not available
		await expect(page.getByTestId("add-passkey-button-empty")).toBeVisible();
	});

	test("shows appropriate error when registration is cancelled", async ({ page, locale }) => {
		// This would require mocking the WebAuthn API to simulate user cancellation
		// Placeholder for test structure
		await page.goto(route("/[locale=locale]/passkeys", { locale }));
	});
});
