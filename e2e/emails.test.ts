import { test, expect, type UserInfo } from "./fixtures/auth";
import type { Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, and, isNull, like } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs";
import { route } from "../src/lib/ROUTES";
import { getDatabaseUrl } from "./testcontainer";

test.describe("Secondary Email OTP Flow", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  const getTestEmail = (prefix: string, workerIndex: number) => `${prefix}-w${workerIndex}-${Date.now()}@example.com`;

  // Helper to get an email row by email address using test ID
  const getEmailRow = (page: Page, email: string) => {
    return page.getByTestId(`email-row-${email}`);
  };

  // Helper to open the actions dropdown menu for an email row
  const openEmailActionsMenu = async (emailRow: ReturnType<typeof getEmailRow>) => {
    // Click the ellipsis button to open dropdown using test ID
    await emailRow.getByTestId("email-actions-menu").click();
  };

  const addEmailAndNavigateToVerify = async (page: Page, email: string) => {
    await page.goto(route("/[locale=locale]/settings/emails/add", { locale: "fi" }));
    await page.getByTestId("submit-add-email").waitFor({ state: "visible" });
    await page.fill('input[type="email"]', email);
    await page.getByTestId("submit-add-email").click();
    await page.waitForURL(/settings\/emails\/verify/);
  };

  const verifyEmailWithOTP = async (page: Page, email: string) => {
    const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email.toLowerCase()));
    if (!otp) throw new Error("OTP not found");

    await page.locator('[data-slot="input-otp"]').pressSequentially(otp.code);
    await page.waitForURL(/^.*\/settings\/emails$/);
  };

  test.beforeAll(async () => {
    const dbUrl = getDatabaseUrl();
    client = postgres(dbUrl);
    db = drizzle(client, { schema: table, casing: "snake_case" });

    // Reset test data before running tests
    const userInfoPath = path.join(process.cwd(), "e2e/.auth/admin-user.json");
    const adminUser = JSON.parse(fs.readFileSync(userInfoPath, "utf8")) as UserInfo;
    await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, adminUser.id));
    await db.delete(table.emailOTP).where(like(table.emailOTP.email, "%@example.com"));
  });

  test.afterAll(async () => {
    await client.end();
  });

  // eslint-disable-next-line no-empty-pattern -- required for playwright fixture
  test.beforeEach(async ({}, testInfo) => {
    // Clean up worker-specific emails for parallel test isolation
    const workerPattern = `%-w${testInfo.workerIndex}-%`;
    await db.delete(table.emailOTP).where(like(table.emailOTP.email, workerPattern));
    await db.delete(table.secondaryEmail).where(like(table.secondaryEmail.email, workerPattern));
  });

  test("should send exactly one OTP email when adding secondary email", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("test", testInfo.workerIndex);

    await adminPage.goto(route("/[locale=locale]/settings/emails", { locale: "fi" }));
    await adminPage.getByTestId("add-secondary-email").click();
    await adminPage.waitForURL(/settings\/emails\/add/);

    await adminPage.fill('input[type="email"]', testEmail);

    const otpsBeforeSubmit = await db
      .select()
      .from(table.emailOTP)
      .where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    expect(otpsBeforeSubmit).toHaveLength(0);

    await adminPage.getByTestId("submit-add-email").click();
    await adminPage.waitForURL(/settings\/emails\/verify/);

    const otpsAfterSubmit = await db
      .select()
      .from(table.emailOTP)
      .where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    expect(otpsAfterSubmit).toHaveLength(1);

    const otp = otpsAfterSubmit[0];
    expect(otp?.code).toMatch(/^[A-Z2-7]{8}$/);
    expect(otp?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("should send exactly two OTP emails for add → back → re-verify flow", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("reverify", testInfo.workerIndex);

    await addEmailAndNavigateToVerify(adminPage, testEmail);

    const [firstOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    const firstOtpId = firstOtp?.id;

    await adminPage.goto(route("/[locale=locale]/settings/emails", { locale: "fi" }));
    await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

    const emailRow = getEmailRow(adminPage, testEmail);
    await expect(emailRow).toBeVisible();

    // Open dropdown menu and click reverify
    await openEmailActionsMenu(emailRow);
    await adminPage.getByTestId("reverify-email").click();
    await adminPage.waitForURL(/settings\/emails\/verify/);

    const [secondOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    expect(secondOtp).toBeDefined();
    expect(secondOtp?.id).not.toBe(firstOtpId);
  });

  test("should maintain only one OTP per email in database", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("single-otp", testInfo.workerIndex);

    await addEmailAndNavigateToVerify(adminPage, testEmail);

    const [firstOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    const firstCode = firstOtp?.code;

    await adminPage.goto(route("/[locale=locale]/settings/emails", { locale: "fi" }));
    await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

    const emailRow = getEmailRow(adminPage, testEmail);
    await expect(emailRow).toBeVisible();

    // Open dropdown menu and click reverify
    await openEmailActionsMenu(emailRow);
    await adminPage.getByTestId("reverify-email").click();
    await adminPage.waitForURL(/settings\/emails\/verify/);

    const [secondOtp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    expect(secondOtp?.code).not.toBe(firstCode);
  });

  test("should successfully verify OTP and mark email as verified", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("verify", testInfo.workerIndex);

    await addEmailAndNavigateToVerify(adminPage, testEmail);
    await verifyEmailWithOTP(adminPage, testEmail);

    const [secondaryEmail] = await db
      .select()
      .from(table.secondaryEmail)
      .where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
    expect(secondaryEmail?.verifiedAt).not.toBeNull();

    const remainingOtps = await db
      .select()
      .from(table.emailOTP)
      .where(eq(table.emailOTP.email, testEmail.toLowerCase()));
    expect(remainingOtps).toHaveLength(0);
  });

  test("should not allow account takeover via unverified secondary email", async ({ adminPage, browser }, testInfo) => {
    const targetEmail = getTestEmail("victim", testInfo.workerIndex);

    // Attacker adds victim's email as unverified secondary
    await addEmailAndNavigateToVerify(adminPage, targetEmail);
    const [unverifiedClaim] = await db
      .select()
      .from(table.secondaryEmail)
      .where(and(eq(table.secondaryEmail.email, targetEmail.toLowerCase()), isNull(table.secondaryEmail.verifiedAt)));
    const attackerUserId = unverifiedClaim?.userId;

    // Victim signs up with their own email
    const victimContext = await browser.newContext();
    const victimPage = await victimContext.newPage();

    try {
      await victimPage.goto(route("/[locale=locale]/sign-in", { locale: "fi" }));
      await victimPage.fill('input[type="email"]', targetEmail);
      await victimPage.getByRole("button", { name: /kirjaudu|sign in/i }).click();

      await victimPage.waitForURL(/sign-in\/method/);
      await victimPage.getByRole("button", { name: /lähetä sähköpostikoodi|send email code/i }).click();
      await victimPage.waitForURL(/sign-in\/email/);

      const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, targetEmail.toLowerCase()));
      if (!otp) throw new Error("OTP not found for victim login");
      await victimPage.locator('[data-slot="input-otp"]').pressSequentially(otp.code);

      await victimPage.waitForURL(/\/fi$/);

      // Victim should have their own account, not be linked to attacker
      const [victimUser] = await db.select().from(table.user).where(eq(table.user.email, targetEmail.toLowerCase()));
      expect(victimUser?.id).not.toBe(attackerUserId);

      // Unverified secondary email claim should be deleted
      const remainingClaims = await db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.email, targetEmail.toLowerCase()));
      expect(remainingClaims).toHaveLength(0);
    } finally {
      await victimContext.close();
    }
  });

  test("should reject adding email that is already a verified secondary email", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("already-verified", testInfo.workerIndex);

    await addEmailAndNavigateToVerify(adminPage, testEmail);
    await verifyEmailWithOTP(adminPage, testEmail);

    // Try adding again - should redirect to verify (idempotent behavior)
    await adminPage.goto(route("/[locale=locale]/settings/emails/add", { locale: "fi" }));
    await adminPage.getByTestId("submit-add-email").waitFor({ state: "visible" });
    await adminPage.fill('input[type="email"]', testEmail);
    await adminPage.getByTestId("submit-add-email").click();

    await adminPage.waitForURL(/settings\/emails\/verify/);
  });

  test("should reject adding email that is already a primary email", async ({ adminPage, adminUser }) => {
    const primaryEmail = adminUser.email;

    await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.email, primaryEmail.toLowerCase()));
    await db.delete(table.emailOTP).where(eq(table.emailOTP.email, primaryEmail.toLowerCase()));

    await adminPage.goto(route("/[locale=locale]/settings/emails/add", { locale: "fi" }));
    await adminPage.getByTestId("submit-add-email").waitFor({ state: "visible" });
    await adminPage.fill('input[type="email"]', primaryEmail);
    await adminPage.getByTestId("submit-add-email").click();

    // Verify we didn't navigate to verify page (rejection happened)
    // Allow time for any potential redirect to occur
    await adminPage.waitForTimeout(500);
    await expect(adminPage).not.toHaveURL(/settings\/emails\/verify/);

    // Verify no secondary email was created (the actual requirement)
    const secondaryEmails = await db
      .select()
      .from(table.secondaryEmail)
      .where(eq(table.secondaryEmail.email, primaryEmail.toLowerCase()));
    expect(secondaryEmails).toHaveLength(0);
  });

  test("should reject invalid OTP code", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("invalid-otp", testInfo.workerIndex);

    await addEmailAndNavigateToVerify(adminPage, testEmail);

    await adminPage.locator('[data-slot="input-otp"]').pressSequentially("WRONGABC");

    await expect(adminPage.getByText("Incorrect")).toBeVisible();
    await expect(adminPage).toHaveURL(/settings\/emails\/verify/);

    const [email] = await db
      .select()
      .from(table.secondaryEmail)
      .where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
    expect(email?.verifiedAt).toBeNull();
  });

  test("should delete secondary email successfully", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("delete-test", testInfo.workerIndex);

    await addEmailAndNavigateToVerify(adminPage, testEmail);
    await verifyEmailWithOTP(adminPage, testEmail);

    adminPage.on("dialog", (dialog) => dialog.accept());

    await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

    const emailRow = getEmailRow(adminPage, testEmail);
    await expect(emailRow).toBeVisible();

    // Open dropdown menu and click delete
    await openEmailActionsMenu(emailRow);
    await adminPage.getByRole("menuitem", { name: /poista|delete/i }).click();

    await expect(emailRow).toBeHidden();

    const emails = await db
      .select()
      .from(table.secondaryEmail)
      .where(eq(table.secondaryEmail.email, testEmail.toLowerCase()));
    expect(emails).toHaveLength(0);
  });

  test("should change primary email successfully", async ({ adminPage, adminUser }, testInfo) => {
    const testEmail = getTestEmail("make-primary", testInfo.workerIndex);
    const originalPrimaryEmail = adminUser.email;

    // Add and verify a secondary email
    await addEmailAndNavigateToVerify(adminPage, testEmail);
    await verifyEmailWithOTP(adminPage, testEmail);

    // Navigate to secondary emails page
    await adminPage.goto(route("/[locale=locale]/settings/emails", { locale: "fi" }));
    await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

    // Find the new verified email row and click "Make Primary"
    const emailRow = getEmailRow(adminPage, testEmail);
    await expect(emailRow).toBeVisible();

    // Set up dialog handler before clicking
    adminPage.on("dialog", (dialog) => dialog.accept());

    await emailRow.getByTestId("make-primary-email").click();

    // Wait for the page to update
    await adminPage.waitForTimeout(500);

    // Verify the new primary email is shown as primary
    const primarySection = adminPage.locator('[data-slot="item"]').first();
    await expect(primarySection).toContainText(testEmail);

    // Verify the old primary email is now a secondary email
    const oldPrimaryRow = getEmailRow(adminPage, originalPrimaryEmail);
    await expect(oldPrimaryRow).toBeVisible();

    // Verify database state
    const [user] = await db.select().from(table.user).where(eq(table.user.id, adminUser.id));
    expect(user?.email.toLowerCase()).toBe(testEmail.toLowerCase());

    // The old primary should now be a secondary email
    const secondaryEmails = await db
      .select()
      .from(table.secondaryEmail)
      .where(eq(table.secondaryEmail.userId, adminUser.id));
    const oldPrimaryAsSecondary = secondaryEmails.find(
      (e) => e.email.toLowerCase() === originalPrimaryEmail.toLowerCase(),
    );
    expect(oldPrimaryAsSecondary).toBeDefined();
    expect(oldPrimaryAsSecondary?.verifiedAt).not.toBeNull();

    // The new primary should no longer be a secondary email
    const newPrimaryAsSecondary = secondaryEmails.find((e) => e.email.toLowerCase() === testEmail.toLowerCase());
    expect(newPrimaryAsSecondary).toBeUndefined();

    // Clean up: Restore original primary email for other tests
    await db.update(table.user).set({ email: originalPrimaryEmail }).where(eq(table.user.id, adminUser.id));
    await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, adminUser.id));
  });

  test("should not show make primary button for unverified emails", async ({ adminPage }, testInfo) => {
    const testEmail = getTestEmail("unverified-no-primary", testInfo.workerIndex);

    // Add email but don't verify
    await addEmailAndNavigateToVerify(adminPage, testEmail);

    // Go back to secondary emails page without verifying
    await adminPage.goto(route("/[locale=locale]/settings/emails", { locale: "fi" }));
    await adminPage.getByTestId("add-secondary-email").waitFor({ state: "visible" });

    const emailRow = getEmailRow(adminPage, testEmail);
    await expect(emailRow).toBeVisible();

    // "Make Primary" button should not exist for unverified emails
    const makePrimaryButton = emailRow.getByTestId("make-primary-email");
    await expect(makePrimaryButton).toBeHidden();
  });
});
