import { test, expect } from "./fixtures/isolated-user";
import * as table from "../src/lib/server/db/schema";
import { eq, and, isNotNull, gt } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Aalto email redirect flow", () => {
  test("redirects back to purchase page with restored form state after verifying aalto.fi email", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    // Find an existing membership that requires student verification and has a Stripe price
    const [membership] = await db
      .select()
      .from(table.membership)
      .where(
        and(
          isNotNull(table.membership.stripePriceId),
          gt(table.membership.endTime, new Date()),
          eq(table.membership.requiresStudentVerification, true),
        ),
      )
      .limit(1);

    if (!membership) throw new Error("No student-verification membership with Stripe price found in seed data");

    const testEmail = `test-redirect-${crypto.randomUUID()}@aalto.fi`;

    try {
      // Navigate to purchase page
      await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
        waitUntil: "networkidle",
      });

      // Select the student membership radio button
      await isolatedPage.locator(`input[type="radio"][value="${membership.id}"]`).check();

      // Check "I am a student" checkbox
      await isolatedPage.locator('input[name="isStudent"]').check();

      // The "add aalto.fi email" alert link should be visible — click it
      // (this saves form state to localStorage and sets the redirect cookie)
      // Must target the specific alert link, not the sidebar navigation link
      await isolatedPage.getByRole("link", { name: /Lisää.*aalto\.fi/i }).click();
      await isolatedPage.waitForURL(/settings\/emails$/);

      // Navigate to add email page
      await isolatedPage.getByTestId("add-secondary-email").click();
      await isolatedPage.waitForURL(/settings\/emails\/add/);

      // Enter an aalto.fi email and submit
      await isolatedPage.fill('input[type="email"]', testEmail);
      await isolatedPage.getByTestId("submit-add-email").click();
      await isolatedPage.waitForURL(/settings\/emails\/verify/);

      // Get OTP from database and enter it
      const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
      if (!otp) throw new Error("OTP not found");

      await isolatedPage.getByTestId("otp-input").pressSequentially(otp.code);

      // Should be redirected back to /fi/new (NOT /fi/settings/emails)
      await isolatedPage.waitForURL(/\/fi\/new/);

      // Verify form state was restored
      await expect(isolatedPage.locator(`input[type="radio"][value="${membership.id}"]`)).toBeChecked();
      await expect(isolatedPage.locator('input[name="isStudent"]')).toBeChecked();

      // The submit button should be enabled now that the email is verified
      // and form state (membership + isStudent) is restored
      await expect(isolatedPage.getByRole("button", { name: /Osta jäsenyys/i })).toBeEnabled();
    } finally {
      // Clean up test data
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, testEmail.toLowerCase()));
      await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, isolatedUser.id));
    }
  });
});
