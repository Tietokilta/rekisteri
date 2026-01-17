import { test, expect } from "./fixtures/auth";
import { WebAuthnHelper } from "./fixtures/webauthn";

/**
 * Passkey E2E Tests
 *
 * Tests passkey registration, management, and authentication flows.
 * Uses virtual WebAuthn authenticator for testing.
 *
 * CRITICAL: CDP-based virtual authenticators cannot run in parallel.
 * This file is configured for serial execution with a single worker.
 */

// Force serial execution across entire file
test.describe.configure({ mode: "serial" });

test.describe("Passkey Management", () => {
	// Serial mode for this suite
	test.describe.configure({ mode: "serial" });

	let webauthn: WebAuthnHelper;

	test.beforeEach(async ({ adminPage }) => {
		webauthn = new WebAuthnHelper(adminPage);
		await webauthn.enable();
		await adminPage.goto("/fi/passkeys");
		// Wait for page to be fully loaded and interactive
		await adminPage.waitForLoadState("networkidle");
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
	// CRITICAL: Serial mode prevents CDP session conflicts
	test.describe.configure({ mode: "serial" });

	let webauthn: WebAuthnHelper;

	test.beforeEach(async ({ adminPage }) => {
		webauthn = new WebAuthnHelper(adminPage);
		await webauthn.enable();

		// Register passkey for admin user
		await adminPage.goto("/fi/passkeys");
		await adminPage.waitForLoadState("networkidle");
		await adminPage.getByTestId("add-passkey-button-empty").click();
		await adminPage.getByPlaceholder(/passkey/i).fill("Testilaitteen");
		await adminPage.getByRole("button", { name: /tallenna/i }).click();
		await expect(adminPage.getByText("Testilaitteen")).toBeVisible();

		// Clear cookies to simulate logout (stay in same context)
		await adminPage.context().clearCookies();
	});

	test.afterEach(async () => {
		await webauthn.disable();
	});

	test("should sign in with passkey", async ({ adminPage, adminUser }) => {
		await adminPage.goto("/fi/sign-in");

		// Enter email
		await adminPage.getByLabel(/sähköposti/i).fill(adminUser.email);
		await adminPage.getByRole("button", { name: /kirjaudu/i }).click();
		await adminPage.waitForURL(/sign-in\/method/);

		// Select passkey authentication
		// Virtual authenticator (with registered credential) exists in this context
		await adminPage.getByTestId("sign-in-with-passkey-button").click();

		// Should be signed in and redirected to home
		await adminPage.waitForURL("/fi");
		await expect(adminPage.getByRole("button", { name: /kirjaudu ulos/i })).toBeVisible();
	});

	test("should allow fallback to email OTP", async ({ adminPage, adminUser }) => {
		await adminPage.goto("/fi/sign-in");

		// Enter email
		await adminPage.getByLabel(/sähköposti/i).fill(adminUser.email);
		await adminPage.getByRole("button", { name: /kirjaudu/i }).click();
		await adminPage.waitForURL(/sign-in\/method/);

		// Verify passkey option is shown
		await expect(adminPage.getByTestId("sign-in-with-passkey-button")).toBeVisible();

		// Choose email OTP instead
		await adminPage.getByRole("button", { name: /sähköposti/i }).click();

		// Should navigate to OTP entry
		await adminPage.waitForURL(/sign-in\/email/);
		await expect(adminPage.getByText(/syötä koodi/i)).toBeVisible();
	});
});
