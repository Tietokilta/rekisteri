import { test, expect } from "./fixtures/isolated-user";
import type { Page } from "@playwright/test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "#lib/server/db/schema.js";
import { eq, and, isNotNull, gt, inArray } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";
import { generateUserId } from "../src/lib/server/auth/utils";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import type { Schema } from "../src/lib/server/db";

async function getStudentMembership(db: PostgresJsDatabase<Schema>) {
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
  return membership;
}

async function openStudentVerification(page: Page, membershipId: string) {
  await page.goto(route("/[locale=locale]/new", { locale: "fi" }), { waitUntil: "networkidle" });
  await page.locator(`input[type="radio"][value="${membershipId}"]`).check();
  await page.getByTestId("is-student").check();
}

async function sendAndEnterCode(page: Page, db: PostgresJsDatabase<Schema>, email: string) {
  await page.getByLabel(/aalto\.fi-sähköpostiosoite/i).fill(email);
  await page.getByRole("button", { name: /lähetä koodi/i }).click();
  await expect(page.getByText(/lähetimme 8-merkkisen koodin/i)).toBeVisible();

  const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email));
  if (!otp) throw new Error("OTP not found");
  await page.getByTestId("student-email-otp").pressSequentially(otp.code);
}

// The aalto.fi address only shows as verified once signed in to the account that owns it
async function expectSignedInAs(page: Page, email: string) {
  await page.getByTestId("is-student").check();
  await expect(page.getByTestId("student-email-verified")).toContainText(email);
}

async function createUser(db: PostgresJsDatabase<Schema>, email: string) {
  const id = generateUserId();
  await db.insert(table.user).values({ id, email, firstNames: "Old", lastName: "Account", homeMunicipality: "Espoo" });
  return id;
}

async function deleteUser(db: PostgresJsDatabase<Schema>, id: string) {
  await db.delete(table.session).where(eq(table.session.userId, id));
  await db.delete(table.member).where(eq(table.member.userId, id));
  await db.delete(table.auditLog).where(eq(table.auditLog.userId, id));
  await db.delete(table.user).where(eq(table.user.id, id));
}

test.describe("Student email verification on the membership page", () => {
  test("verifies the aalto.fi email without leaving the page", async ({ isolatedPage, isolatedUser, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-inline-${crypto.randomUUID()}@aalto.fi`;

    try {
      await openStudentVerification(isolatedPage, membership.id);
      const buyButton = isolatedPage.getByRole("button", { name: /osta jäsenyys/i });
      await expect(buyButton).toBeDisabled();

      await sendAndEnterCode(isolatedPage, db, email);

      await expect(isolatedPage.getByTestId("student-email-verified")).toContainText(email);
      await expect(isolatedPage).toHaveURL(/\/fi\/new$/);
      // Form state is kept because the page never changed
      await expect(isolatedPage.locator(`input[type="radio"][value="${membership.id}"]`)).toBeChecked();
      await expect(buyButton).toBeEnabled();
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, isolatedUser.id));
    }
  });

  test("rejects addresses on other domains", async ({ isolatedPage, db }) => {
    const membership = await getStudentMembership(db);
    await openStudentVerification(isolatedPage, membership.id);

    await isolatedPage.getByLabel(/aalto\.fi-sähköpostiosoite/i).fill("someone@example.com");
    await isolatedPage.getByRole("button", { name: /lähetä koodi/i }).click();
    await expect(isolatedPage.getByText(/syötä aalto\.fi-sähköpostiosoite/i)).toBeVisible();
  });

  test("offers to sign in to the account that already owns the address, and removes the empty account", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = await createUser(db, email);

    try {
      await openStudentVerification(isolatedPage, membership.id);

      // Sending the code looks the same as for any other address
      await sendAndEnterCode(isolatedPage, db, email);

      const conflict = isolatedPage.getByTestId("email-account-conflict");
      await expect(conflict).toContainText(/tällä sähköpostiosoitteella on jo tili/i);
      await conflict.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();

      await expectSignedInAs(isolatedPage, email);
      const notice = isolatedPage.getByTestId("account-switch-notice");
      await expect(notice).toContainText(email);
      await expect(notice).toContainText(`Lisäsimme osoitteen ${isolatedUser.email} tähän tiliin`);

      // The address the empty account signed in with now leads to the other account
      const [movedEmail] = await db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.email, isolatedUser.email));
      expect(movedEmail).toMatchObject({ userId: ownerId, expiresAt: null });
      expect(movedEmail?.verifiedAt).not.toBeNull();
      await expect(isolatedPage.getByTestId("personal-email-prompt")).toBeHidden();

      // The empty account that was left behind is gone, and the switch is audited
      const [leftAccount] = await db.select().from(table.user).where(eq(table.user.id, isolatedUser.id));
      expect(leftAccount).toBeUndefined();
      const [audit] = await db
        .select()
        .from(table.auditLog)
        .where(and(eq(table.auditLog.userId, ownerId), eq(table.auditLog.action, "auth.account_switch")));
      expect(audit?.metadata).toMatchObject({ fromUserId: isolatedUser.id, deletedFromAccount: true });
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });

  test("keeps the account that is left if it has a membership", async ({ isolatedPage, isolatedUser, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = await createUser(db, email);
    const [pastMembership] = await db
      .select()
      .from(table.membership)
      .where(eq(table.membership.membershipTypeId, membership.membershipTypeId))
      .limit(1);
    if (!pastMembership) throw new Error("No membership found");
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: pastMembership.id,
      status: "resigned",
    });

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await sendAndEnterCode(isolatedPage, db, email);
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();
      await expect(isolatedPage.getByTestId("personal-email-prompt")).toBeVisible();
      await expect(isolatedPage.getByTestId("account-switch-notice")).toContainText(
        `Aiempi tilisi säilyy ennallaan. Pääset siihen kirjautumalla osoitteella ${isolatedUser.email}.`,
      );

      // Shown once
      await isolatedPage.reload();
      await expect(isolatedPage.getByTestId("personal-email-prompt")).toBeVisible();
      await expect(isolatedPage.getByTestId("account-switch-notice")).toBeHidden();

      const [leftAccount] = await db.select().from(table.user).where(eq(table.user.id, isolatedUser.id));
      expect(leftAccount).toBeDefined();
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });

  test("keeps the account that is left if it has signed in to an app", async ({ isolatedPage, isolatedUser, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = await createUser(db, email);
    const clientId = `e2e-switch-${crypto.randomUUID()}`;
    await db.insert(table.oidcClient).values({
      clientId,
      name: "E2E Switch Client",
      clientSecret: hashClientSecret("sec_e2e_switch"),
      redirectUris: ["http://localhost/callback"],
      scopes: ["openid"],
    });
    await db
      .insert(table.oidcConsent)
      .values({ id: crypto.randomUUID(), userId: isolatedUser.id, clientId, scopes: ["openid"] });

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await sendAndEnterCode(isolatedPage, db, email);
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();
      await expect(isolatedPage.getByTestId("personal-email-prompt")).toBeVisible();

      const [leftAccount] = await db.select().from(table.user).where(eq(table.user.id, isolatedUser.id));
      expect(leftAccount).toBeDefined();
    } finally {
      await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, clientId));
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });

  test("wrong guesses before the right code don't block switching accounts", async ({ isolatedPage, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = await createUser(db, email);

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await isolatedPage.getByLabel(/aalto\.fi-sähköpostiosoite/i).fill(email);
      await isolatedPage.getByRole("button", { name: /lähetä koodi/i }).click();
      const otpInput = isolatedPage.getByTestId("student-email-otp");
      await expect(otpInput).toBeVisible();

      // 4 of the 5 attempts go to wrong codes
      for (let i = 0; i < 4; i++) {
        await otpInput.pressSequentially("ZZZZZZZZ");
        await expect(isolatedPage.getByText(/virheellinen/i)).toBeVisible();
        await otpInput.press("ControlOrMeta+a");
        await otpInput.press("Backspace");
      }

      const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email));
      if (!otp) throw new Error("OTP not found");
      await otpInput.pressSequentially(otp.code);
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();
      await expectSignedInAs(isolatedPage, email);
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });

  test("the profile filled in on the removed account carries over", async ({ isolatedPage, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = generateUserId();
    await db.insert(table.user).values({ id: ownerId, email });

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await sendAndEnterCode(isolatedPage, db, email);
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();
      await expectSignedInAs(isolatedPage, email);

      const [owner] = await db.select().from(table.user).where(eq(table.user.id, ownerId));
      expect(owner).toMatchObject({
        firstNames: "Test",
        lastName: "User",
        homeMunicipality: "Helsinki",
      });
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });

  test("a mistyped address left behind doesn't hide the verified one", async ({ isolatedPage, isolatedUser, db }) => {
    const membership = await getStudentMembership(db);
    const typo = `test-typo-${crypto.randomUUID()}@aalto.fi`;
    const email = `test-inline-${crypto.randomUUID()}@aalto.fi`;

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await isolatedPage.getByLabel(/aalto\.fi-sähköpostiosoite/i).fill(typo);
      await isolatedPage.getByRole("button", { name: /lähetä koodi/i }).click();
      await isolatedPage.getByRole("button", { name: /vaihda osoite/i }).click();
      await sendAndEnterCode(isolatedPage, db, email);
      await expect(isolatedPage.getByTestId("student-email-verified")).toContainText(email);

      await isolatedPage.reload();
      await isolatedPage.getByTestId("is-student").check();
      await expect(isolatedPage.getByTestId("student-email-verified")).toContainText(email);
    } finally {
      await db.delete(table.emailOTP).where(inArray(table.emailOTP.email, [typo, email]));
      await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, isolatedUser.id));
    }
  });

  test("a code that expires on the conflict screen can be replaced with a new one", async ({ isolatedPage, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = await createUser(db, email);

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await sendAndEnterCode(isolatedPage, db, email);
      await expect(isolatedPage.getByTestId("email-account-conflict")).toBeVisible();

      await db
        .update(table.emailOTP)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(table.emailOTP.email, email));
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();

      // A new code was sent; entering it leads back to the switch
      await expect(isolatedPage.getByText(/lähetimme uuden koodin/i)).toBeVisible();
      const [otp] = await db
        .select()
        .from(table.emailOTP)
        .where(and(eq(table.emailOTP.email, email), gt(table.emailOTP.expiresAt, new Date())));
      if (!otp) throw new Error("New OTP not found");
      await isolatedPage.getByTestId("student-email-otp").pressSequentially(otp.code);
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();
      await expectSignedInAs(isolatedPage, email);
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });

  test("after the code's cookie has expired on the conflict screen, it starts over", async ({ isolatedPage, db }) => {
    const membership = await getStudentMembership(db);
    const email = `test-owned-${crypto.randomUUID()}@aalto.fi`;
    const ownerId = await createUser(db, email);

    try {
      await openStudentVerification(isolatedPage, membership.id);
      await sendAndEnterCode(isolatedPage, db, email);
      await expect(isolatedPage.getByTestId("email-account-conflict")).toBeVisible();

      await isolatedPage.context().clearCookies({ name: "email_otp" });
      await isolatedPage.getByRole("button", { name: /kirjaudu toiselle tilille/i }).click();
      await expect(isolatedPage.getByRole("button", { name: /lähetä koodi/i })).toBeVisible();
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });
});

test.describe("Adding an email in settings", () => {
  test("only reveals that an address has its own account after the code is verified", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    const email = `test-settings-owned-${crypto.randomUUID()}@example.com`;
    const ownerId = await createUser(db, email);

    try {
      await isolatedPage.goto(route("/[locale=locale]/settings/emails/add", { locale: "fi" }));
      await isolatedPage.fill('input[type="email"]', email);
      await isolatedPage.getByTestId("submit-add-email").click();

      // Same response as for an unused address
      await isolatedPage.waitForURL(/settings\/emails\/verify/);

      const [otp] = await db.select().from(table.emailOTP).where(eq(table.emailOTP.email, email));
      if (!otp) throw new Error("OTP not found");
      await isolatedPage.getByTestId("otp-input").pressSequentially(otp.code);

      await expect(isolatedPage.getByTestId("email-account-conflict")).toBeVisible();
      // The address was not added to this account
      const claims = await db
        .select()
        .from(table.secondaryEmail)
        .where(and(eq(table.secondaryEmail.userId, isolatedUser.id), eq(table.secondaryEmail.email, email)));
      expect(claims).toHaveLength(0);
    } finally {
      await db.delete(table.emailOTP).where(eq(table.emailOTP.email, email));
      await deleteUser(db, ownerId);
    }
  });
});
