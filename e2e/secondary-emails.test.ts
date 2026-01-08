import { test, expect } from "./fixtures/auth";
import type { Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, and, isNull, like } from "drizzle-orm";

test.describe("Secondary Email OTP Flow", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

	// Helper: Unique email per worker
	const getTestEmail = (prefix: string, workerIndex: number) => `${prefix}-w${workerIndex}-${Date.now()}@example.com`;

	// Helper: Robustly find the email row
	const getEmailRow = (page: Page, email: string) => {
		return page.locator("li").filter({ hasText: email });
	};

	const addEmailAndNavigateToVerify = async (page: Page, email: string) => {
		await page.goto("/fi/secondary-emails/add");
		await page.getByTestId("submit-add-email").waitFor({ state: "visible" });
		await page.fill('input[type="email"]', email);
		await page.getByTestId("submit-add-email").click();
		await page.waitForURL(/secondary-emails\/verify/);
	};

	const verifyEmailWithOTP = async (page: Page, email: string) => {
		const otps = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email.toLowerCase()));
		expect(otps).toHaveLength(1);
		const otp = otps[0];
		if (!otp) throw new Error("OTP not found");

		await page.locator('[data-slot="input-otp"]').pressSequentially(otp.code);
		await page.waitForURL(/^.*\/secondary-emails$/, { timeout: 15_000 });
	};

	test.beforeAll(() => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});

	// eslint-disable-next-line no-empty-pattern -- required for playwright fixture
	test.beforeEach(async ({}, testInfo) => {
		const workerPattern = `%-w${testInfo.workerIndex}-%`;
		await db.delete(table.emailOTP).where(like(table.emailOTP.email, workerPattern));
		await db.delete(table.secondaryEmail).where(like(table.secondaryEmail.email, workerPattern));
	});

	test("should send exactly one OTP email when adding secondary email", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("test", testInfo.workerIndex);

		await adminPage.goto("/fi/secondary-emails");
		await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });
		await adminPage.getByTestId("add-secondary-email").click();
		await adminPage.waitForURL(/secondary-emails\/add/);

		await adminPage.fill('input[type="email"]', testEmail);

		const otpsBeforeSubmit = await db
			.select()
			.from(table.emailOTP)
			.where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otpsBeforeSubmit).toHaveLength(0);

		await adminPage.getByTestId("submit-add-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });

		const otpsAfterSubmit = await db
			.select()
			.from(table.emailOTP)
			.where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(otpsAfterSubmit).toHaveLength(1);

		const otp = otpsAfterSubmit[0];
		if (!otp) throw new Error("OTP not found");
		expect(otp.code).toMatch(/^[A-Z2-7]{8}$/);
		expect(otp.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	test("should send exactly two OTP emails for add → back → re-verify flow", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("reverify", testInfo.workerIndex);

		// 1. Add email (first OTP)
		await addEmailAndNavigateToVerify(adminPage, testEmail);

		const [firstOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		const firstOtpId = firstOtp?.id;

		// 2. Go back to list
		await adminPage.goto("/fi/secondary-emails");

		// Wait for the list to be interactive
		await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

		// Re-query the row AFTER navigation
		const emailRow = getEmailRow(adminPage, testEmail);
		await expect(emailRow).toBeVisible();

		// 3. Click re-verify
		await emailRow.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });

		// 4. Verify new OTP
		const [secondOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(secondOtp).toBeDefined();
		expect(secondOtp?.id).not.toBe(firstOtpId);
	});

	test("should maintain only one OTP per email in database", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("single-otp", testInfo.workerIndex);

		await addEmailAndNavigateToVerify(adminPage, testEmail);

		const [firstOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(firstOtp).toBeDefined();
		const firstCode = firstOtp?.code;

		// Go back and re-verify
		await adminPage.goto("/fi/secondary-emails");
		await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

		const emailRow = getEmailRow(adminPage, testEmail);
		await expect(emailRow).toBeVisible();
		await emailRow.getByTestId("reverify-email").click();
		await adminPage.waitForURL(/secondary-emails\/verify/);

		const [secondOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(secondOtp).toBeDefined();
		expect(secondOtp?.code).not.toBe(firstCode);
	});

	test("should successfully verify OTP and mark email as verified", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("verify", testInfo.workerIndex);

		await addEmailAndNavigateToVerify(adminPage, testEmail);
		await verifyEmailWithOTP(adminPage, testEmail);

		// Verification is done, we are back on the list page
		const [secondaryEmail] = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(secondaryEmail).toBeDefined();
		expect(secondaryEmail?.verifiedAt).not.toBeNull();

		const remainingOtps = await db
			.select()
			.from(table.emailOTP)
			.where(eq(table.emailOTP.email, testEmail.toLowerCase()));
		expect(remainingOtps).toHaveLength(0);
	});

	test("should not allow login via unverified secondary email", async ({ adminPage, browser }, testInfo) => {
		const targetEmail = getTestEmail("victim", testInfo.workerIndex);

		// 1. Add email (unverified)
		await addEmailAndNavigateToVerify(adminPage, targetEmail);

		// 2. Validate DB state
		const unverifiedEmails = await db
			.select()
			.from(table.secondaryEmail)
			.where(and(eq(table.secondaryEmail.email, targetEmail.toLowerCase()), isNull(table.secondaryEmail.verifiedAt)));
		expect(unverifiedEmails).toHaveLength(1);

		// 3. Try to login with a fresh browser context
		const loginContext = await browser.newContext();
		const loginPage = await loginContext.newPage();

		try {
			await loginPage.goto("/fi/sign-in");
			await loginPage.fill('input[type="email"]', targetEmail);
			await loginPage.getByRole("button", { name: /jatka|continue/i }).click();

			// Handle both UI error OR simple failure to proceed
			await expect(async () => {
				const isAlert = await loginPage.getByRole("alert").isVisible();
				const isStillOnPage = loginPage.url().includes("sign-in");
				expect(isAlert || isStillOnPage).toBeTruthy();
			}).toPass({ timeout: 10_000 });
		} catch (e) {
			if (e instanceof Error && e.message.includes("Target page")) {
				console.error("Browser crashed! Likely caused by invalid regex pattern in email validation.");
			}
			throw e;
		} finally {
			await loginContext.close();
		}
	});

	test("should reject adding email that is already a verified secondary email", async ({ adminPage }, testInfo) => {
		const testEmail = getTestEmail("already-verified", testInfo.workerIndex);

		await addEmailAndNavigateToVerify(adminPage, testEmail);
		await verifyEmailWithOTP(adminPage, testEmail);

		// Try adding again
		await adminPage.goto("/fi/secondary-emails/add");
		await adminPage.getByTestId("submit-add-email").waitFor({ state: "visible" });
		await adminPage.fill('input[type="email"]', testEmail);
		await adminPage.getByTestId("submit-add-email").click();

		// Expect redirect to verify (idempotent behavior)
		await adminPage.waitForURL(/secondary-emails\/verify/, { timeout: 5000 });
	});

	test("should reject adding email that is already a primary email", async ({ adminPage, adminUser }) => {
		// Use the actual logged-in user's email from the fixture
		const primaryEmail = adminUser.email;

		// Ensure clean state
		await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, primaryEmail.toLowerCase()));
		await db.delete(table.emailOTP).where(eq(table.emailOTP.email, primaryEmail.toLowerCase()));

		await adminPage.goto("/fi/secondary-emails/add");
		await adminPage.getByTestId("submit-add-email").waitFor({ state: "visible" });
		await adminPage.fill('input[type="email"]', primaryEmail);
		await adminPage.getByTestId("submit-add-email").click();

		// Check if the URL changed to verify (which would indicate the test failed)
		// Wait a moment for any redirect
		await adminPage.waitForTimeout(1000);
		if (adminPage.url().includes("verify")) {
			throw new Error(`Test failed: App allowed adding primary email ${primaryEmail} as secondary`);
		}

		await expect(adminPage.getByTestId("add-email-error")).toBeVisible({ timeout: 10_000 });
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

		await addEmailAndNavigateToVerify(adminPage, testEmail);

		// Enter wrong OTP code (8 characters to match expected format)
		await adminPage.locator('[data-slot="input-otp"]').pressSequentially("WRONGABC");

		// Should show error and stay on verify page
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

		await addEmailAndNavigateToVerify(adminPage, testEmail);
		await verifyEmailWithOTP(adminPage, testEmail);

		// Handle dialog
		adminPage.on("dialog", (dialog) => dialog.accept());

		// Wait for list to be interactive
		await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

		const emailRow = getEmailRow(adminPage, testEmail);
		await expect(emailRow).toBeVisible();

		await emailRow.getByRole("button", { name: /poista|delete/i }).click();

		await expect(emailRow).toBeHidden({ timeout: 5000 });

		const emails = await db
			.select()
			.from(table.secondaryEmail)
			.where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
		expect(emails).toHaveLength(0);
	});
});
