import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { BrowserContext } from "@playwright/test";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import {
  REDIRECT_URI,
  createSessionCookie,
  createTestContext,
  decodeJwt,
  generatePkce,
  getBaseUrl,
  waitForCallbackUrl,
} from "./helpers/oidc";

// When the login page may skip the consent screen and reuse the Rekisteri session, and when not.

const CLIENT_ID = "oidc-e2e-consent";
const SECRET = "sec_e2e_consent";
const USER_ID = "oidc-e2e-consent-user";
const ALLOW_BUTTON = /Salli pääsy|Allow access/i;
const OTHER_USER_ID = "oidc-e2e-consent-other";

function authUrl(scope: string, extra: Record<string, string> = {}, challenge = generatePkce().challenge) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope,
    state: "s",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...extra,
  });
  return `${getBaseUrl()}/oidc/authorize?${params}`;
}

/** Opens the URL in a fresh tab; reports whether it went straight to the app. */
async function open(context: BrowserContext, url: string) {
  const page = await context.newPage();
  let reachedCallback = false;
  page.on("request", (req) => {
    if (req.url().startsWith(REDIRECT_URI)) reachedCallback = true;
  });
  try {
    await page.goto(url);
  } catch {
    // A redirect to the unhosted callback errors out; reachedCallback tells the story
  }
  return { page, reachedCallback: () => reachedCallback };
}

test.describe("OIDC consent and fresh login", () => {
  test.beforeEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.insert(table.oidcClient).values({
      clientId: CLIENT_ID,
      name: "E2E Consent",
      clientSecret: hashClientSecret(SECRET),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "email"],
    });
    await db.insert(table.user).values({ id: USER_ID, email: "oidc-consent@example.com" }).onConflictDoNothing();
  });

  test.afterEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.delete(table.session).where(eq(table.session.userId, USER_ID));
    await db.delete(table.auditLog).where(eq(table.auditLog.userId, USER_ID));
    await db.delete(table.user).where(eq(table.user.id, USER_ID));
  });

  test("consent covers only the approved scopes; asking for more shows the consent screen again", async ({
    browser,
    db,
  }) => {
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);

    const first = await open(context, authUrl("openid profile"));
    await waitForCallbackUrl(first.page, () => first.page.getByRole("button", { name: ALLOW_BUTTON }).click());

    // Same scopes again: no consent screen
    const again = await open(context, authUrl("openid profile"));
    await expect.poll(again.reachedCallback).toBe(true);

    // A scope the user hasn't approved yet: consent screen again
    const more = await open(context, authUrl("openid profile email"));
    expect(more.reachedCallback()).toBe(false);
    await expect(more.page.getByRole("button", { name: ALLOW_BUTTON })).toBeVisible();
    await context.close();
  });

  test("prompt=login needs a new sign-in instead of reusing the session", async ({ browser, db, request }) => {
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);
    const first = await open(context, authUrl("openid"));
    await waitForCallbackUrl(first.page, () => first.page.getByRole("button", { name: ALLOW_BUTTON }).click());

    const startedAt = Math.floor(Date.now() / 1000);
    const pkce = generatePkce();
    const forced = await open(context, authUrl("openid", { prompt: "login" }, pkce.challenge));
    expect(forced.reachedCallback()).toBe(false);
    await expect(forced.page.getByTestId("oidc-reauth")).toBeVisible();

    // "Sign in again" logs out and shows the sign-in form
    await forced.page.getByRole("button", { name: /Kirjaudu uudelleen|Sign in again/i }).click();
    await expect(forced.page.locator("input[type=email]")).toBeVisible();

    // Signing in creates a new session, which completes the login with an honest auth_time
    // (sign-in times are compared at one-second resolution)
    await forced.page.waitForTimeout(1100);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);
    // (navigate rather than reload: reloading would resubmit the logout POST)
    const loginPage = forced.page.url().split("?", 1)[0] ?? "";
    const callback = await waitForCallbackUrl(forced.page, () => forced.page.goto(loginPage));
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")}` },
      form: {
        grant_type: "authorization_code",
        code: callback.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    expect(tokenRes.status()).toBe(200);
    const { payload } = decodeJwt((await tokenRes.json()).id_token);
    expect(payload.auth_time).toBeGreaterThanOrEqual(startedAt - 1);
    await context.close();
  });
});

test.describe("OIDC switching users mid-flow", () => {
  test("another user approving a flow hinted at the previous user completes instead of failing", async ({
    browser,
    db,
    request,
  }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.insert(table.oidcClient).values({
      clientId: CLIENT_ID,
      name: "E2E Consent",
      clientSecret: hashClientSecret(SECRET),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid"],
    });
    for (const [id, email] of [
      [USER_ID, "oidc-consent@example.com"],
      [OTHER_USER_ID, "oidc-consent-other@example.com"],
    ] as const) {
      await db.insert(table.user).values({ id, email }).onConflictDoNothing();
    }

    // Get an id_token for the first user
    const context = await createTestContext(browser);
    const firstCookie = await createSessionCookie(db, USER_ID);
    await context.addCookies([firstCookie]);
    const pkce = generatePkce();
    const first = await open(context, authUrl("openid", {}, pkce.challenge));
    const callback = await waitForCallbackUrl(first.page, () =>
      first.page.getByRole("button", { name: ALLOW_BUTTON }).click(),
    );
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: { authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")}` },
      form: {
        grant_type: "authorization_code",
        code: callback.searchParams.get("code") ?? "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    const { id_token: idToken } = await tokenRes.json();

    // Someone else signs in to Rekisteri in the same browser; the app hints at the first user
    await context.clearCookies({ name: firstCookie.name });
    await context.addCookies([await createSessionCookie(db, OTHER_USER_ID)]);
    const hinted = await context.newPage();
    await hinted.goto(authUrl("openid", { id_token_hint: idToken }));
    // The provider logs out the previous user's session first; that used to delete this interaction
    // and end on an error page. Now the flow reaches the app (which must check `sub` against its hint).
    const result = await waitForCallbackUrl(hinted, () => hinted.getByRole("button", { name: ALLOW_BUTTON }).click());
    expect(result.searchParams.get("code") ?? result.searchParams.get("error")).toBeTruthy();

    // In a browser without a provider session the hint is checked up front: the signed-in user isn't
    // the hinted one, so they're asked to sign in again (neither auto-approved nor turned away)
    const otherBrowser = await createTestContext(browser);
    await otherBrowser.addCookies([await createSessionCookie(db, OTHER_USER_ID)]);
    const fresh = await open(otherBrowser, authUrl("openid", { id_token_hint: idToken }));
    await expect(fresh.page.getByTestId("oidc-reauth")).toBeVisible();
    expect(fresh.reachedCallback()).toBe(false);
    await otherBrowser.close();

    await context.close();
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    for (const id of [USER_ID, OTHER_USER_ID]) {
      await db.delete(table.session).where(eq(table.session.userId, id));
      await db.delete(table.auditLog).where(eq(table.auditLog.userId, id));
      await db.delete(table.user).where(eq(table.user.id, id));
    }
  });
});

test.describe("OIDC login page", () => {
  test.beforeEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.insert(table.oidcClient).values({
      clientId: CLIENT_ID,
      name: "E2E Consent",
      clientSecret: hashClientSecret(SECRET),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid"],
    });
    await db.insert(table.user).values({ id: USER_ID, email: "oidc-consent@example.com" }).onConflictDoNothing();
  });

  test.afterEach(async ({ db }) => {
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, CLIENT_ID));
    await db.delete(table.session).where(eq(table.session.userId, USER_ID));
    await db.delete(table.auditLog).where(eq(table.auditLog.userId, USER_ID));
    await db.delete(table.user).where(eq(table.user.id, USER_ID));
  });

  test("two sign-ins in parallel tabs both complete", async ({ browser, db }) => {
    const context = await createTestContext(browser);
    await context.addCookies([await createSessionCookie(db, USER_ID)]);

    // Each login's cookie is scoped to its own /oidc/login/{uid}, so the second tab doesn't
    // overwrite the first one's
    const first = await open(context, authUrl("openid"));
    const second = await open(context, authUrl("openid"));
    for (const tab of [first, second]) {
      const callback = await waitForCallbackUrl(tab.page, () =>
        tab.page.getByRole("button", { name: ALLOW_BUTTON }).click(),
      );
      expect(callback.searchParams.get("code")).toBeTruthy();
    }
    await context.close();
  });

  test("uses the browser's language when the user hasn't chosen one", async ({ browser, db }) => {
    const context = await browser.newContext({ locale: "en-US" });
    await context.route(/http:\/\/localhost:3000/, (route) => route.fulfill({ status: 200, body: "Mock Callback" }));
    await context.addCookies([await createSessionCookie(db, USER_ID)]);

    const { page } = await open(context, authUrl("openid"));
    await expect(page.getByRole("button", { name: "Allow access" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });
});
