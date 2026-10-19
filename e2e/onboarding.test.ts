import { test, expect } from "./fixtures/isolated-user";
import type { Page } from "@playwright/test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "#lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";
import type { Schema } from "../src/lib/server/db";

async function signInWithEmailCode(
  page: Page,
  db: PostgresJsDatabase<Schema>,
  email: string,
  onMethodPage?: () => Promise<void>,
) {
  await page.getByLabel(/sähköposti/i).fill(email);
  await page.getByRole("button", { name: /jatka/i }).click();
  await page.waitForURL(/sign-in\/method/);
  await onMethodPage?.();
  await page.getByRole("button", { name: /lähetä sähköpostikoodi/i }).click();
  await page.waitForURL(/sign-in\/email/);

  const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email));
  if (!otp) throw new Error("OTP not found");
  await page.locator('[data-slot="input-otp"]').pressSequentially(otp.code);
}

async function deleteUserByEmail(db: PostgresJsDatabase<Schema>, email: string) {
  const [user] = await db.select().from(table.user).where(eq(table.user.email, email));
  await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
  if (!user) return;
  await db.delete(table.session).where(eq(table.session.userId, user.id));
  await db.delete(table.auditLog).where(eq(table.auditLog.userId, user.id));
  await db.delete(table.user).where(eq(table.user.id, user.id));
}

test.describe("First-time user flow", () => {
  test("new user returns to the membership page after sign-in and profile save", async ({ browser, db }) => {
    const email = `test-onboarding-${crypto.randomUUID()}@example.com`;
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // Visiting a protected page sends the user to sign-in, remembering the page
      await page.goto(route("/[locale=locale]/new", { locale: "fi" }));
      await page.waitForURL(/\/fi\/sign-in\?next=%2Ffi%2Fnew/);

      await signInWithEmailCode(page, db, email, async () => {
        // New users must use the email code, so it's the primary option
        const buttons = page.getByRole("main").getByRole("button");
        await expect(buttons.first()).toHaveText(/lähetä sähköpostikoodi/i);
      });

      // Back on the membership page; the profile is still empty
      await page.waitForURL(/\/fi\/new$/);
      await page.getByRole("link", { name: /siirry profiiliin/i }).click();
      await page.waitForURL(/settings\/profile\?next=/);

      await page.getByLabel(/etunimet/i).fill("Uusi");
      await page.getByLabel(/sukunimi/i).fill("Jäsen");
      await page.getByLabel(/kotikunta/i).fill("Espoo");
      await page.getByRole("button", { name: /tallenna/i }).click();

      // Saving continues to the membership page
      await page.waitForURL(/\/fi\/new$/);
      await expect(page.getByRole("button", { name: /osta jäsenyys/i })).toBeVisible();
    } finally {
      await context.close();
      await deleteUserByEmail(db, email);
    }
  });

  test("off-site next values are ignored after sign-in", async ({ browser, db }) => {
    const email = `test-onboarding-${crypto.randomUUID()}@example.com`;
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(
        `${route("/[locale=locale]/sign-in", { locale: "fi" })}?next=${encodeURIComponent("//evil.example/fi")}`,
      );
      await signInWithEmailCode(page, db, email);
      await page.waitForURL(/\/fi$/);
    } finally {
      await context.close();
      await deleteUserByEmail(db, email);
    }
  });

  test("passkey comes first after it was used last, and the email code still works", async ({ page }) => {
    const email = `test-onboarding-${crypto.randomUUID()}@example.com`;
    await page.goto(route("/[locale=locale]/sign-in", { locale: "fi" }));
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify("passkey")), `signInMethod:${email}`);
    await page.getByLabel(/sähköposti/i).fill(email);
    await page.getByRole("button", { name: /jatka/i }).click();
    await page.waitForURL(/sign-in\/method/);

    const buttons = page.getByRole("main").getByRole("button");
    await expect(buttons.first()).toHaveText(/avainkoodilla/i);
    await page.getByRole("button", { name: /lähetä sähköpostikoodi/i }).click();
    await page.waitForURL(/sign-in\/email/);
  });

  test("changing the email keeps the next parameter", async ({ page }) => {
    await page.goto(`${route("/[locale=locale]/sign-in", { locale: "fi" })}?next=%2Ffi%2Fnew`);
    await page.getByLabel(/sähköposti/i).fill(`test-onboarding-${crypto.randomUUID()}@example.com`);
    await page.getByRole("button", { name: /jatka/i }).click();
    await page.waitForURL(/sign-in\/method/);
    await page.getByRole("button", { name: /käytä toista sähköpostiosoitetta/i }).click();
    await page.waitForURL(/\/fi\/sign-in\?next=%2Ffi%2Fnew$/);
  });

  test("an abandoned sign-in doesn't decide where a later one goes", async ({ browser, db }) => {
    const email = `test-onboarding-${crypto.randomUUID()}@example.com`;
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${route("/[locale=locale]/sign-in", { locale: "fi" })}?next=%2Ffi%2Fnew`);
      await page.goto(route("/[locale=locale]/sign-in", { locale: "fi" }));
      await signInWithEmailCode(page, db, email);
      await page.waitForURL(/\/fi$/);
    } finally {
      await context.close();
      await deleteUserByEmail(db, email);
    }
  });

  test("switching language keeps the next parameter", async ({ page }) => {
    await page.goto(`${route("/[locale=locale]/sign-in", { locale: "fi" })}?next=%2Ffi%2Fnew`);
    await page.getByRole("radio", { name: "en" }).click();
    await page.waitForURL(/\/en\/sign-in\?next=%2Ffi%2Fnew/);
  });
});

test.describe("Onboarding checklist", () => {
  test("user without a profile is asked to fill in their details first", async ({ isolatedPage, isolatedUser, db }) => {
    await db
      .update(table.user)
      .set({ firstNames: null, lastName: null, homeMunicipality: null })
      .where(eq(table.user.id, isolatedUser.id));

    await isolatedPage.goto(route("/[locale=locale]", { locale: "fi" }));

    const checklist = isolatedPage.getByTestId("onboarding-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.getByRole("link", { name: /täytä tiedot/i })).toHaveAttribute(
      "href",
      "/fi/settings/profile?next=%2Ffi%2Fnew",
    );
  });

  test("user with a profile but no membership continues to choose a membership", async ({ isolatedPage }) => {
    await isolatedPage.goto(route("/[locale=locale]", { locale: "fi" }));

    const checklist = isolatedPage.getByTestId("onboarding-checklist");
    await expect(checklist.getByText(/valmis/i)).toBeAttached();
    await expect(checklist.getByRole("link", { name: /valitse jäsenyys/i })).toHaveAttribute("href", "/fi/new");
  });
});
