import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { encodeHexLowerCase } from "@oslojs/encoding";
import type { BrowserContext, Page } from "@playwright/test";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import {
  REDIRECT_URI,
  createSessionCookie,
  createTestContext,
  generatePkce,
  getBaseUrl,
  waitForCallbackUrl,
  type TestDb,
} from "./helpers/oidc";

// The provider keeps its own session cookie (_session). These tests make sure it can't be used to
// sign in to apps once the Rekisteri session behind it is gone or belongs to someone else.

const CLIENT_ID = "oidc-e2e-session";
const OTHER_USER_ID = "oidc-e2e-session-other-user";

function authUrl(state: string) {
  return `${getBaseUrl()}/oidc/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid&state=${state}&code_challenge=${generatePkce().challenge}&code_challenge_method=S256`;
}

function sessionIdOf(token: string) {
  return encodeHexLowerCase(crypto.createHash("sha256").update(token).digest());
}

/** Signs in to the client as `userId` through the consent screen, leaving a provider session behind. */
async function signInToClient(db: TestDb, context: BrowserContext, page: Page, userId: string) {
  const cookie = await createSessionCookie(db, userId);
  await context.addCookies([cookie]);
  await page.goto(authUrl("first"));
  await waitForCallbackUrl(page, () =>
    page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i }).click(),
  );
  expect((await context.cookies()).map((c) => c.name)).toContain("_session");
  return cookie;
}

/** Starts a new sign-in and reports whether it reached the login page or went straight to the app. */
async function startSignIn(context: BrowserContext) {
  // Fresh tab: the previous one may still be settling on the mocked callback URL
  const page = await context.newPage();
  let reachedCallback = false;
  page.on("request", (req) => {
    if (req.url().startsWith(REDIRECT_URI)) reachedCallback = true;
  });
  // If the bug comes back this redirects to the unhosted callback and the navigation errors out
  try {
    await page.goto(authUrl("second"));
  } catch {
    // reachedCallback tells the story
  }
  return { page, reachedCallback };
}

test.describe("OIDC provider session follows the Rekisteri session", () => {
  test.beforeEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.insert(table.oidcClient).values({
      clientId: CLIENT_ID,
      name: "E2E Session Client",
      clientSecret: hashClientSecret("sec_e2e_session"),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid"],
    });
    await db.delete(table.user).where(eq(table.user.id, OTHER_USER_ID));
    await db.insert(table.user).values({ id: OTHER_USER_ID, email: "oidc-session-other@example.com" });
  });

  test.afterEach(async ({ db }) => {
    await db.delete(table.session).where(eq(table.session.userId, OTHER_USER_ID));
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.delete(table.user).where(eq(table.user.id, OTHER_USER_ID));
  });

  test("logging out of Rekisteri requires logging in again", async ({ browser, db, adminUser }) => {
    const context = await createTestContext(browser);
    const page = await context.newPage();
    const cookie = await signInToClient(db, context, page, adminUser.id);

    // Log out of Rekisteri only; the provider's _session cookie stays
    await db.delete(table.session).where(eq(table.session.id, sessionIdOf(cookie.value)));
    await context.clearCookies({ name: cookie.name });

    const { page: signInPage, reachedCallback } = await startSignIn(context);
    expect(reachedCallback).toBe(false);
    await expect(signInPage).toHaveURL(/\/oidc\/login\//);
    await context.close();
  });

  test("a Rekisteri session for another user doesn't reuse the previous user's provider session", async ({
    browser,
    db,
    adminUser,
  }) => {
    const context = await createTestContext(browser);
    const page = await context.newPage();
    const cookie = await signInToClient(db, context, page, adminUser.id);

    // Someone else logs in to Rekisteri in the same browser
    await db.delete(table.session).where(eq(table.session.id, sessionIdOf(cookie.value)));
    await context.clearCookies({ name: cookie.name });
    await context.addCookies([await createSessionCookie(db, OTHER_USER_ID)]);

    // They haven't consented to this client, so they must end up on the consent page as themselves
    const signIn = await startSignIn(context);
    expect(signIn.reachedCallback).toBe(false);
    await expect(signIn.page).toHaveURL(/\/oidc\/login\//);
    await expect(signIn.page.getByText("oidc-session-other@example.com").first()).toBeVisible();
    await context.close();
  });
});
