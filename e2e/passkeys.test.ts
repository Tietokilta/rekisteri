import { test, expect, type UserInfo } from "./fixtures/auth";
import { WebAuthnHelper } from "./fixtures/webauthn";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";
import { route } from "../src/lib/ROUTES";

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
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;
	let adminUser: UserInfo;

	test.beforeAll(async () => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });

		// Load admin user info
		const userInfoPath = path.join(process.cwd(), "e2e/.auth/admin-user.json");
		adminUser = JSON.parse(fs.readFileSync(userInfoPath, "utf8")) as UserInfo;

		// Clean up any existing passkeys before tests
		await db.delete(table.passkey).where(eq(table.passkey.userId, adminUser.id));
	});

	test.afterAll(async () => {
		await client.end();
	});

	test.beforeEach(async ({ adminPage }) => {
		// Clean up passkeys from previous test
		await db.delete(table.passkey).where(eq(table.passkey.userId, adminUser.id));

		// Navigate first, before setting up CDP session
		await adminPage.goto(route("/[locale=locale]/settings/passkeys", { locale: "fi" }));

		// Wait for the page element to ensure page is ready
		await adminPage.getByTestId("add-passkey-button-empty").waitFor({ state: "visible" });

		// NOW set up virtual authenticator after page is stable
		webauthn = new WebAuthnHelper(adminPage);
		await webauthn.enable();
	});

	test.afterEach(async () => {
		if (webauthn) {
			await webauthn.disable();
		}
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
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;
	let adminUser: UserInfo;

	test.beforeAll(async () => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });

		// Load admin user info
		const userInfoPath = path.join(process.cwd(), "e2e/.auth/admin-user.json");
		adminUser = JSON.parse(fs.readFileSync(userInfoPath, "utf8")) as UserInfo;

		// Clean up any existing passkeys before tests
		await db.delete(table.passkey).where(eq(table.passkey.userId, adminUser.id));
	});

	test.afterAll(async () => {
		await client.end();
	});

	test.beforeEach(async ({ adminPage }) => {
		// Clean up passkeys from previous test
		await db.delete(table.passkey).where(eq(table.passkey.userId, adminUser.id));

		// Navigate and wait for page to be ready
		await adminPage.goto(route("/[locale=locale]/settings/passkeys", { locale: "fi" }));
		await adminPage.getByTestId("add-passkey-button-empty").waitFor({ state: "visible" });

		// Set up virtual authenticator
		webauthn = new WebAuthnHelper(adminPage);
		await webauthn.enable();

		// Register passkey for admin user
		await adminPage.getByTestId("add-passkey-button-empty").click();
		await adminPage.getByPlaceholder(/passkey/i).fill("Testilaitteen");
		await adminPage.getByRole("button", { name: /tallenna/i }).click();
		await expect(adminPage.getByText("Testilaitteen")).toBeVisible();

		// Clear cookies to simulate logout (stay in same context)
		await adminPage.context().clearCookies();
	});

	test.afterEach(async () => {
		if (webauthn) {
			await webauthn.disable();
		}
	});

	test("should sign in with passkey", async ({ adminPage, adminUser }) => {
		await adminPage.goto(route("/[locale=locale]/sign-in", { locale: "fi" }));

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
		await adminPage.goto(route("/[locale=locale]/sign-in", { locale: "fi" }));

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
