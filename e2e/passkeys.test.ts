import { test, expect } from "./fixtures/auth";
import { WebAuthnHelper } from "./fixtures/webauthn";

/**
 * Passkey E2E Tests
 *
 * Tests passkey registration, management, and authentication flows.
 * Uses virtual WebAuthn authenticator for testing.
 */

test.describe("Passkey Management", () => {
	let webauthn: WebAuthnHelper;

	test.beforeEach(async ({ adminPage }) => {
		webauthn = new WebAuthnHelper(adminPage);
		await webauthn.enable();
		await adminPage.goto("/fi/passkeys");
	});

	test.afterEach(async () => {
		await webauthn.disable();
	});

	test("should register passkey with default name", async ({ adminPage }) => {
		// Click add passkey button in empty state
		await adminPage.getByTestId("add-passkey-button-empty").click();

		// Save with default name (date-based)
		await adminPage.getByRole("button", { name: /tallenna/i }).click();

		// Verify passkey appears in list with date-based name
		await expect(adminPage.getByText(/passkey \d{4}-\d{2}-\d{2}/i)).toBeVisible();
	});

	test("should register passkey with custom name", async ({ adminPage }) => {
		const customName = "Testitunniste";

		await adminPage.getByTestId("add-passkey-button-empty").click();

		// Enter custom name
		await adminPage.getByPlaceholder(/passkey/i).fill(customName);
		await adminPage.getByRole("button", { name: /tallenna/i }).click();

		// Verify custom name appears
		await expect(adminPage.getByText(customName)).toBeVisible();
	});

	test("should rename existing passkey", async ({ adminPage }) => {
		const originalName = "Alkuperäinen";
		const newName = "Uudelleennimetty";

		// Register passkey
		await adminPage.getByTestId("add-passkey-button-empty").click();
		await adminPage.getByPlaceholder(/passkey/i).fill(originalName);
		await adminPage.getByRole("button", { name: /tallenna/i }).click();
		await expect(adminPage.getByText(originalName)).toBeVisible();

		// Rename
		await adminPage.getByRole("button", { name: /nimeä uudelleen/i }).click();
		await adminPage.getByLabel(/nimi|name/i).fill(newName);
		await adminPage.getByRole("button", { name: /tallenna/i }).click();

		// Verify new name
		await expect(adminPage.getByText(newName)).toBeVisible();
		await expect(adminPage.getByText(originalName)).not.toBeVisible();
	});

	test("should delete passkey after confirmation", async ({ adminPage }) => {
		const passkeyName = "Poistettava";

		// Register passkey
		await adminPage.getByTestId("add-passkey-button-empty").click();
		await adminPage.getByPlaceholder(/passkey/i).fill(passkeyName);
		await adminPage.getByRole("button", { name: /tallenna/i }).click();
		await expect(adminPage.getByText(passkeyName)).toBeVisible();

		// Delete (confirm dialog)
		adminPage.once("dialog", (dialog) => dialog.accept());
		await adminPage.getByRole("button", { name: /poista/i }).click();

		// Verify removed
		await expect(adminPage.getByText(passkeyName)).not.toBeVisible();
		await expect(adminPage.getByText(/ei passkey/i)).toBeVisible();
	});
});

test.describe("Passkey Authentication", () => {
	let webauthn: WebAuthnHelper;

	test.beforeEach(async ({ adminPage, adminUser }) => {
		webauthn = new WebAuthnHelper(adminPage);
		await webauthn.enable();

		// Register passkey for admin user
		await adminPage.goto("/fi/passkeys");
		await adminPage.getByTestId("add-passkey-button-empty").click();
		await adminPage.getByPlaceholder(/passkey/i).fill("Testilaitteen");
		await adminPage.getByRole("button", { name: /tallenna/i }).click();
		await expect(adminPage.getByText("Testilaitteen")).toBeVisible();

		// Sign out
		await adminPage.context().clearCookies();
	});

	test.afterEach(async () => {
		await webauthn.disable();
	});

	test("should sign in with passkey", async ({ page, adminUser }) => {
		await page.goto("/fi/sign-in");

		// Enter email
		await page.getByLabel(/sähköposti/i).fill(adminUser.email);
		await page.getByRole("button", { name: /kirjaudu/i }).click();
		await page.waitForURL(/sign-in\/method/);

		// Select passkey authentication
		await page.getByTestId("sign-in-with-passkey-button").click();

		// Should be signed in and redirected to home
		await page.waitForURL("/fi");
		await expect(page.getByRole("button", { name: /kirjaudu ulos/i })).toBeVisible();
	});

	test("should allow fallback to email OTP", async ({ page, adminUser }) => {
		await page.goto("/fi/sign-in");

		// Enter email
		await page.getByLabel(/sähköposti/i).fill(adminUser.email);
		await page.getByRole("button", { name: /kirjaudu/i }).click();
		await page.waitForURL(/sign-in\/method/);

		// Verify passkey option is shown
		await expect(page.getByTestId("sign-in-with-passkey-button")).toBeVisible();

		// Choose email OTP instead
		await page.getByRole("button", { name: /sähköposti/i }).click();

		// Should navigate to OTP entry
		await page.waitForURL(/sign-in\/email/);
		await expect(page.getByText(/syötä koodi/i)).toBeVisible();
	});
});
