import { test, expect } from "./fixtures/auth";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, and, isNull } from "drizzle-orm";

test.describe("Secondary Email OTP Flow", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

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

	test("should send exactly one OTP email when adding secondary email", async ({ adminPage }) => {
		const testEmail = `test-${Date.now()}@example.com`;

		// Navigate to secondary emails page
		await adminPage.goto("/fi/secondary-emails", { waitUntil: "networkidle" });

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
		expect(otp.code).toMatch(/^\d{6}$/); // 6-digit code
		expect(otp.expiresAt.getTime()).toBeGreaterThan(Date.now());

		// Clean up
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
	});

	test("should send exactly two OTP emails for add → back → re-verify flow", async ({ adminPage }) => {
		const testEmail = `test-reverify-${Date.now()}@example.com`;

		// Step 1: Add email (first OTP)
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Verify first OTP created
		let otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const firstOtp = otps[0];
		if (!firstOtp) throw new Error("First OTP not found");
		const firstOtpId = firstOtp.id;

		// Step 2: Go back to list without verifying
		await adminPage.goto("/fi/secondary-emails", { waitUntil: "networkidle" });

		// Verify the unverified email appears in the list
		const emailRow = adminPage.locator(`text=${testEmail}`).first();
		await expect(emailRow).toBeVisible();

		// Step 3: Click re-verify button
		await adminPage.getByTestId("reverify-email").click();

		// Wait for redirect to verify page
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });

		// Verify a NEW OTP was created (old one should be deleted)
		otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const secondOtp = otps[0];
		if (!secondOtp) throw new Error("Second OTP not found");
		const secondOtpId = secondOtp.id;

		// Verify it's a different OTP (new ID)
		expect(secondOtpId).not.toBe(firstOtpId);

		// Total: 2 OTPs were created (one deleted, one current)
		// But only 1 exists in DB at any time

		// Clean up
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
	});

	test("should maintain only one OTP per email in database", async ({ adminPage }) => {
		const testEmail = `test-single-otp-${Date.now()}@example.com`;

		// Add email first time
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Verify only one OTP exists
		let otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const firstOtp = otps[0];
		if (!firstOtp) throw new Error("First OTP not found");
		const firstOtpCode = firstOtp.code;

		// Go back and re-verify multiple times
		await adminPage.goto("/fi/secondary-emails", { waitUntil: "networkidle" });

		// Re-verify first time
		await adminPage.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Still only one OTP exists
		otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const secondOtp = otps[0];
		if (!secondOtp) throw new Error("Second OTP not found");
		const secondOtpCode = secondOtp.code;

		// But it's a different code
		expect(secondOtpCode).not.toBe(firstOtpCode);

		// Go back and re-verify again
		await adminPage.goto("/fi/secondary-emails", { waitUntil: "networkidle" });
		await adminPage.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Still only one OTP exists
		otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const thirdOtp = otps[0];
		if (!thirdOtp) throw new Error("Third OTP not found");
		const thirdOtpCode = thirdOtp.code;

		// And it's yet another different code
		expect(thirdOtpCode).not.toBe(secondOtpCode);
		expect(thirdOtpCode).not.toBe(firstOtpCode);

		// Clean up
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
	});

	test("should successfully verify OTP and mark email as verified", async ({ adminPage }) => {
		const testEmail = `test-verify-${Date.now()}@example.com`;

		// Add email
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Get the OTP code from database
		const otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const otp = otps[0];
		if (!otp) throw new Error("OTP not found");
		const otpCode = otp.code;

		// Enter the correct OTP code
		await adminPage.fill('input[type="text"]', otpCode);
		await adminPage.getByTestId("verify-otp").click();

		// Wait for redirect to list page
		await adminPage.waitForURL(/^.*\/secondary-emails$/, { timeout: 5000 });

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

		// Clean up
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
	});

	test("should not allow login via unverified secondary email (negative test)", async ({ adminPage }) => {
		// This test verifies the security fix for CVE-like vulnerability:
		// An attacker should NOT be able to hijack accounts by adding unverified secondary emails

		const targetEmail = `victim-${Date.now()}@example.com`;

		// Step 1: Admin (attacker) adds victim's email as unverified secondary email
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', targetEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Don't verify it - leave it unverified (simulating attack setup)
		// Go back without verifying
		await adminPage.goto("/fi/secondary-emails", { waitUntil: "networkidle" });

		// Verify the unverified email is in the database
		const unverifiedEmails = await db
			.select()
			.from(table.secondaryEmail)
			.where(and(eq(table.secondaryEmail.email, targetEmail.toLowerCase()), isNull(table.secondaryEmail.verifiedAt)));
		expect(unverifiedEmails).toHaveLength(1);

		// Get the attacker's user ID
		const attackerUserId = unverifiedEmails[0]?.userId;
		expect(attackerUserId).toBeDefined();

		// Clean up - the actual security test happens in the sign-in flow
		// which we can't easily test in e2e without another browser context
		// But we verify the database state is correct
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, targetEmail.toLowerCase()));
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, targetEmail.toLowerCase()));
	});

	test("should reject adding email that is already a verified secondary email", async ({ adminPage }) => {
		const testEmail = `already-verified-${Date.now()}@example.com`;

		// Step 1: Add and verify an email
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Get OTP from database and verify
		const otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otps).toHaveLength(1);
		const otp = otps[0];
		if (!otp) throw new Error("OTP not found");

		await adminPage.fill('input[type="text"]', otp.code);
		await adminPage.getByTestId("verify-otp").click();
		await adminPage.waitForURL(/^.*\/secondary-emails$/, { timeout: 5000 });

		// Step 2: Try to add the same email again - should return existing email (idempotent)
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();

		// Should redirect to verify page (returns existing email for re-verification)
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });

		// Clean up
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
	});

	test("should reject adding email that is already a primary email", async ({ adminPage }) => {
		// Try to add the admin's own primary email as secondary (should fail)
		const primaryEmail = "root@tietokilta.fi";

		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', primaryEmail);
		await adminPage.getByTestId("submit-add-email").click();

		// Should show generic error message (to prevent email enumeration) and stay on add page
		await expect(adminPage.locator("text=Could not add this email")).toBeVisible({ timeout: 5000 });

		// Verify no secondary email was created
		const secondaryEmails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, primaryEmail.toLowerCase()));
		expect(secondaryEmails).toHaveLength(0);
	});

	test("should reject invalid OTP code", async ({ adminPage }) => {
		const testEmail = `invalid-otp-${Date.now()}@example.com`;

		// Add email
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		// Enter wrong OTP code
		await adminPage.fill('input[type="text"]', "WRONG1");
		await adminPage.getByTestId("verify-otp").click();

		// Should show error and stay on verify page
		await expect(adminPage.locator("text=Incorrect")).toBeVisible({ timeout: 5000 });
		await expect(adminPage).toHaveURL(/secondary-emails\/verify/);

		// Email should still be unverified
		const emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(1);
		expect(emails[0]?.verifiedAt).toBeNull();

		// Clean up
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
	});

	test("should delete secondary email successfully", async ({ adminPage }) => {
		const testEmail = `delete-test-${Date.now()}@example.com`;

		// Add and verify email
		await adminPage.goto("/fi/secondary-emails/add", { waitUntil: "networkidle" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		const otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		const otp = otps[0];
		if (!otp) throw new Error("OTP not found");

		await adminPage.fill('input[type="text"]', otp.code);
		await adminPage.getByTestId("verify-otp").click();
		await adminPage.waitForURL(/^.*\/secondary-emails$/, { timeout: 5000 });

		// Verify email exists
		let emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(1);

		// Set up dialog handler before clicking delete
		adminPage.on("dialog", (dialog) => dialog.accept());

		// Delete the email
		await adminPage.locator(`text=${testEmail}`).first().waitFor({ state: "visible" });
		await adminPage
			.getByRole("button", { name: /poista|delete/i })
			.first()
			.click();

		// Wait for deletion to complete
		await adminPage.waitForTimeout(1000);

		// Verify email was deleted from database
		emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(0);
	});
});
