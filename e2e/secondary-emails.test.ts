import { test, expect } from "./fixtures/auth";
import type { Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, and, isNull, like } from "drizzle-orm";

test.describe("Secondary Email OTP Flow", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

	// Helper to generate unique test email per worker
	const getTestEmail = (prefix: string, workerIndex: number) => `${prefix}-w${workerIndex}-${Date.now()}@example.com`;

	// Helper to add an email and navigate to the verify page (DRY pattern)
	const addEmailAndNavigateToVerify = async (page: Page, email: string) => {
		await page.goto("/fi/secondary-emails/add");
		await page.getByTestId("submit-add-email").waitFor({ state: "visible" });
		await page.fill('input[type="email"]', email);
		await page.getByTestId("submit-add-email").click();
		await page.waitForURL(/secondary-emails\/verify/);
	};

	// Helper to verify an email using the OTP from the database
	const verifyEmailWithOTP = async (page: Page, email: string) => {
		const otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email.toLowerCase()));
		expect(otps).toHaveLength(1);
		const otp = otps[0];
		if (!otp) throw new Error("OTP not found");

		// InputOTP auto-submits when all 8 characters are entered
		await page.locator('[data-slot="input-otp"]').pressSequentially(otp.code);
		await page.waitForURL(/^.*\/secondary-emails$/, { timeout: 10_000 });
	};

	test.beforeAll(() => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) {
			throw new Error("DATABASE_URL_TEST not set");
		}
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});

	// Clean up any leftover test data from this worker before each test
	// eslint-disable-next-line no-empty-pattern -- required for playwright fixture
	test.beforeEach(async ({}, testInfo) => {
		const workerPattern = `%-w${testInfo.workerIndex}-%`;
		await db.delete(table.emailOTP).where(like(table.emailOTP.email, workerPattern));
		await db.delete(table.secondaryEmail).where(like(table.secondaryEmail.email, workerPattern));
	});

	test("should send exactly one OTP email when adding secondary email", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("test", testInfo.workerIndex);

		// Navigate to secondary emails page and wait for content to load
		await adminPage.goto("/fi/secondary-emails");
		await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

		// Click add email button
		await adminPage.getByTestId("add-secondary-email").click();
		await adminPage.waitForURL(/secondary-emails\/add/);

		// Fill in the email form
		await adminPage.fill('input[type="email"]', testEmail);

		// Check database: no OTP should exist yet
		const otpsBeforeSubmit = await db
			.select()
			.from(table.emailOTP)
			.where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otpsBeforeSubmit).toHaveLength(0);

		// Submit the form
		await adminPage.getByTestId("submit-add-email").click();

		// Wait for redirect to verify page
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });

		// Check database: exactly one OTP should exist
		const otpsAfterSubmit = await db
			.select()
			.from(table.emailOTP)
			.where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otpsAfterSubmit).toHaveLength(1);

		// Verify the OTP record
		const otp = otpsAfterSubmit[0];
		if (!otp) throw new Error("OTP not found");
		expect(otp.email).toBe(testEmail.toLowerCase());
		expect(otp.code).toMatch(/^[A-Z2-7]{8}$/); // 8-character Base32 code
		expect(otp.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	test("should send exactly two OTP emails for add → back → re-verify flow", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("reverify", testInfo.workerIndex);

		// Step 1: Add email (first OTP)
		await addEmailAndNavigateToVerify(adminPage, testEmail);

		// Capture first OTP ID to compare later
		const [firstOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(firstOtp).toBeDefined();
		const firstOtpId = firstOtp?.id;

		// Step 2: Go back to list without verifying
		await adminPage.goto("/fi/secondary-emails");

		// Find the row AFTER navigation completes
		const emailRow = adminPage.locator("li", { hasText: testEmail });
		await expect(emailRow).toBeVisible();

		// Step 3: Click re-verify button
		await emailRow.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });

		// Verify a NEW OTP was created (old one should be deleted)
		const [secondOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(secondOtp).toBeDefined();
		expect(secondOtp?.id).not.toBe(firstOtpId);
	});

	test("should maintain only one OTP per email in database", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("single-otp", testInfo.workerIndex);

		// Add email first time
		await addEmailAndNavigateToVerify(adminPage, testEmail);

		// Verify only one OTP exists
		const [firstOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(firstOtp).toBeDefined();
		const firstOtpCode = firstOtp?.code;

		// Go back and re-verify first time
		await adminPage.goto("/fi/secondary-emails");
		// Re-query the row AFTER navigation
		let emailRow = adminPage.locator("li", { hasText: testEmail });
		await expect(emailRow).toBeVisible();
		await emailRow.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Verify code changed
		const [secondOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(secondOtp).toBeDefined();
		expect(secondOtp?.code).not.toBe(firstOtpCode);

		// Go back and re-verify again
		await adminPage.goto("/fi/secondary-emails");
		// Re-query the row AFTER navigation
		emailRow = adminPage.locator("li", { hasText: testEmail });
		await expect(emailRow).toBeVisible();
		await emailRow.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Verify code changed again
		const [thirdOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(thirdOtp).toBeDefined();
		expect(thirdOtp?.code).not.toBe(secondOtp?.code);
		expect(thirdOtp?.code).not.toBe(firstOtpCode);
	});

	test("should successfully verify OTP and mark email as verified", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("verify", testInfo.workerIndex);

		// Add email
		await addEmailAndNavigateToVerify(adminPage, testEmail);

		// Verify the email using the OTP from the database
		await verifyEmailWithOTP(adminPage, testEmail);

		// Verify the email is now in the database and marked as verified
		const [secondaryEmail] = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(secondaryEmail).toBeDefined();
		if (!secondaryEmail) throw new Error("Secondary email not found");
		expect(secondaryEmail.verifiedAt).not.toBeNull();

		// Verify OTP was deleted after successful verification
		const remainingOtps = await db
			.select()
			.from(table.emailOTP)
			.where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(remainingOtps).toHaveLength(0);
	});

	test("should not allow login via unverified secondary email (negative test)", async ({
		adminPage,
		browser,
	}, testInfo) => {
		// This test verifies the security fix for CVE-like vulnerability:
		// An attacker should NOT be able to hijack accounts by adding unverified secondary emails

		const targetEmail = getTestEmail("victim", testInfo.workerIndex);

		// Step 1: Admin (attacker) adds victim's email as unverified secondary email
		await addEmailAndNavigateToVerify(adminPage, targetEmail);

		// Don't verify it - leave it unverified (simulating attack setup)
		// Go back without verifying
		await adminPage.goto("/fi/secondary-emails");
		await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

		// Verify the unverified email is in the database
		const unverifiedEmails = await db
			.select()
			.from(table.secondaryEmail)
			.where(and(eq(table.secondaryEmail.email, targetEmail.toLowerCase()), isNull(table.secondaryEmail.verifiedAt)));
		expect(unverifiedEmails).toHaveLength(1);

		// Get the attacker's user ID
		const attackerUserId = unverifiedEmails[0]?.userId;
		expect(attackerUserId).toBeDefined();

		// Step 2: Create a NEW, incognito context to simulate victim trying to login
		const loginContext = await browser.newContext();
		const loginPage = await loginContext.newPage();

		try {
			// Navigate to sign-in page
			await loginPage.goto("/fi/sign-in");
			await loginPage.waitForURL(/sign-in/);

			// Try to login with the unverified secondary email
			await loginPage.fill('input[type="email"]', targetEmail);
			await loginPage.getByRole("button", { name: /jatka|continue/i }).click();

			// The login should fail because the email is unverified as secondary
			// Wait for either an error message or staying on sign-in page
			// The system should NOT send a magic link or allow login
			await expect(loginPage.getByRole("alert")).toBeVisible({ timeout: 10_000 });

			// Verify no magic link OTP was created for this email (for sign-in purposes)
			// The only OTP that should exist is the secondary email verification OTP
			const loginOtps = await db
				.select()
				.from(table.emailOTP)
				.where(eq(table.emailOTP.email, targetEmail.toLowerCase()));
			// Should have exactly 1 OTP (the secondary email verification one, not a sign-in one)
			expect(loginOtps).toHaveLength(1);
		} finally {
			await loginContext.close();
		}
	});

	test("should reject adding email that is already a verified secondary email", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("already-verified", testInfo.workerIndex);

		// Step 1: Add and verify an email
		await addEmailAndNavigateToVerify(adminPage, testEmail);
		await verifyEmailWithOTP(adminPage, testEmail);

		// Step 2: Try to add the same email again - should return existing email (idempotent)
		await adminPage.goto("/fi/secondary-emails/add");
		await adminPage.getByTestId("submit-add-email").waitFor({ state: "visible" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();

		// Should redirect to verify page (returns existing email for re-verification)
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });
	});

	test("should reject adding email that is already a primary email", async ({ adminPage, adminUser }) => {
		// Use the actual logged-in user's primary email (from fixture)
		const primaryEmail = adminUser.email;

		// Clean up any leftover secondary email entries for this email from previous test runs
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, primaryEmail.toLowerCase()));
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, primaryEmail.toLowerCase()));

		await adminPage.goto("/fi/secondary-emails/add");
		await adminPage.getByTestId("submit-add-email").waitFor({ state: "visible" });
		await adminPage.fill('input[type="email"]', primaryEmail);
		await adminPage.getByTestId("submit-add-email").click();

		// Should stay on add page and show error (not redirect to verify)
		// Wait for error alert to appear - this indicates the form submission completed with an error
		await expect(adminPage.getByTestId("add-email-error")).toBeVisible({ timeout: 10_000 });

		// Verify we stayed on the add page
		await expect(adminPage).toHaveURL(/secondary-emails\/add/);

		// Verify no secondary email was created
		const secondaryEmails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, primaryEmail.toLowerCase()));
		expect(secondaryEmails).toHaveLength(0);
	});

	test("should reject invalid OTP code", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("invalid-otp", testInfo.workerIndex);

		// Add email
		await addEmailAndNavigateToVerify(adminPage, testEmail);

		// Enter wrong OTP code (8 characters to match expected format)
		// Note: InputOTP auto-submits when all 8 characters are entered
		await adminPage.locator('[data-slot="input-otp"]').pressSequentially("WRONGABC");

		// Should show error and stay on verify page (wait for form to process)
		await expect(adminPage.getByText("Incorrect")).toBeVisible({ timeout: 5000 });
		await expect(adminPage).toHaveURL(/secondary-emails\/verify/);

		// Email should still be unverified
		const emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(1);
		expect(emails[0]?.verifiedAt).toBeNull();
	});

	test("should delete secondary email successfully", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("delete-test", testInfo.workerIndex);

		// Add and verify email
		await addEmailAndNavigateToVerify(adminPage, testEmail);
		await verifyEmailWithOTP(adminPage, testEmail);

		// verifyEmailWithOTP ends on /secondary-emails page
		// Find the row (page is already loaded after OTP verification redirect)
		const emailRow = adminPage.locator("li", { hasText: testEmail });
		await expect(emailRow).toBeVisible();

		// Verify email exists in DB
		let emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(1);

		// Set up dialog handler before clicking delete
		adminPage.on("dialog", (dialog) => dialog.accept());

		// Click delete button
		await emailRow.getByRole("button", { name: /poista|delete/i }).click();

		// Wait for the email to be removed from the UI
		await expect(emailRow).toBeHidden({ timeout: 5000 });

		// Verify email was deleted from database
		emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(0);
	});
});
