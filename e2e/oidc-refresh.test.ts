import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import {
  REFRESH_CLIENT_ID,
  REFRESH_SECRET,
  REDIRECT_URI,
  generatePkce,
  createSessionCookie,
  createTestContext,
  waitForCallbackUrl,
  validateIdTokenSecurityAndClaims,
  validateTokenResponseFormat,
} from "./helpers/oidc";
import type { APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("OIDC Authorization Code Flow with Refresh Token (E2E)", () => {
  const clientId = REFRESH_CLIENT_ID;
  let activeRefreshToken: string | undefined;

  test.beforeAll(async ({ dbConnection }) => {
    const db = dbConnection.db;

    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, REFRESH_CLIENT_ID));

    await db.insert(table.oidcClient).values({
      clientId,
      name: "E2E Auth Code Refresh Client",
      clientSecret: hashClientSecret(REFRESH_SECRET),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "email", "offline_access"],
      type: "authorization_code",
    });
  });

  test.afterAll(async ({ dbConnection }) => {
    const db = dbConnection.db;
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, REFRESH_CLIENT_ID));
  });

  async function exchangeRefreshToken(request: APIRequestContext, refreshToken: string) {
    return request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${REFRESH_SECRET}`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
    });
  }

  test("user not logged in, user has not given consent (the code and a refresh token should be returned)", async ({
    browser,
    db,
    adminUser,
    request,
  }) => {
    await db
      .delete(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));
    await db.delete(table.oidcEntity).where(eq(table.oidcEntity.clientId, clientId));

    const context = await createTestContext(browser);
    const page = await context.newPage();

    const pkce = generatePkce();
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=rstate1&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    await page.goto(authUrl);
    await expect(page).toHaveURL(/\/(fi|en)\/oidc\/login\//);

    // Log in
    const cookie = await createSessionCookie(db, adminUser.id);
    await context.addCookies([cookie]);
    await page.reload();

    // Consent screen
    await expect(page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i })).toBeVisible();
    const callbackUrl = await waitForCallbackUrl(page, () =>
      page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i }).click(),
    );
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchange code at /oidc/token
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${REFRESH_SECRET}`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "authorization_code",
        code: code || "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });

    expect(tokenRes.status()).toBe(200);
    const tokenData = await tokenRes.json();

    // Verify Token Response Format & Security (no access_token)
    validateTokenResponseFormat(tokenData);
    expect(tokenData.refresh_token).toBeDefined();

    // Verify ID Token security & claims
    validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);

    // Test that the refresh token WORKS immediately
    const refreshRes = await exchangeRefreshToken(request, tokenData.refresh_token as string);
    expect(refreshRes.status()).toBe(200);
    const refreshedData = await refreshRes.json();
    validateTokenResponseFormat(refreshedData);
    validateIdTokenSecurityAndClaims(refreshedData.id_token, clientId, adminUser.id);

    activeRefreshToken = (refreshedData.refresh_token as string) || (tokenData.refresh_token as string);

    await context.close();
  });

  test("consent removed (refresh token should NO LONGER work and user should be asked consent in next test)", async ({
    request,
    db,
    adminUser,
  }) => {
    // Delete consent and entities (consent removal)
    await db.delete(table.oidcEntity).where(eq(table.oidcEntity.clientId, clientId));
    await db
      .delete(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));

    const [consentRow] = await db
      .select()
      .from(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));
    expect(consentRow).toBeUndefined();

    // Test: The previous refresh token MUST NOT work when consent is removed
    expect(activeRefreshToken).toBeDefined();
    const refreshRes = await exchangeRefreshToken(request, activeRefreshToken as string);
    expect(refreshRes.status()).toBe(400);
    const errorData = await refreshRes.json();
    expect(errorData.error).toBe("invalid_grant");

    activeRefreshToken = undefined;
  });

  test("user logged in, user has not given consent (the code and a refresh token should be returned and work)", async ({
    browser,
    db,
    adminUser,
    request,
  }) => {
    const context = await createTestContext(browser);
    const cookie = await createSessionCookie(db, adminUser.id);
    await context.addCookies([cookie]);
    const page = await context.newPage();

    const pkce = generatePkce();
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=rstate2&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    await page.goto(authUrl);
    await expect(page).toHaveURL(/\/(fi|en)\/oidc\/login\//);

    // Consent screen shown
    await expect(page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i })).toBeVisible();
    const callbackUrl = await waitForCallbackUrl(page, () =>
      page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i }).click(),
    );
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchange code
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${REFRESH_SECRET}`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "authorization_code",
        code: code || "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });

    expect(tokenRes.status()).toBe(200);
    const tokenData = await tokenRes.json();
    validateTokenResponseFormat(tokenData);
    expect(tokenData.refresh_token).toBeDefined();
    validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);

    // Test that the refresh token WORKS
    const refreshRes = await exchangeRefreshToken(request, tokenData.refresh_token as string);
    expect(refreshRes.status()).toBe(200);
    const refreshedData = await refreshRes.json();
    validateTokenResponseFormat(refreshedData);
    validateIdTokenSecurityAndClaims(refreshedData.id_token, clientId, adminUser.id);

    activeRefreshToken = (refreshedData.refresh_token as string) || (tokenData.refresh_token as string);

    await context.close();
  });

  test("user logged in, user has given consent (the code and a refresh token should be returned and work)", async ({
    browser,
    db,
    adminUser,
    request,
  }) => {
    const context = await createTestContext(browser);
    const cookie = await createSessionCookie(db, adminUser.id);
    await context.addCookies([cookie]);
    const page = await context.newPage();

    const pkce = generatePkce();
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=rstate3&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    // Automatic authorization!
    const callbackUrl = await waitForCallbackUrl(page, () => page.goto(authUrl));
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchange code
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${REFRESH_SECRET}`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "authorization_code",
        code: code || "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });

    expect(tokenRes.status()).toBe(200);
    const tokenData = await tokenRes.json();
    validateTokenResponseFormat(tokenData);
    expect(tokenData.refresh_token).toBeDefined();
    validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);

    // Test that the refresh token WORKS
    const refreshRes = await exchangeRefreshToken(request, tokenData.refresh_token as string);
    expect(refreshRes.status()).toBe(200);
    const refreshedData = await refreshRes.json();
    validateTokenResponseFormat(refreshedData);
    validateIdTokenSecurityAndClaims(refreshedData.id_token, clientId, adminUser.id);

    activeRefreshToken = (refreshedData.refresh_token as string) || (tokenData.refresh_token as string);

    await context.close();
  });

  test("user logs out (refresh token should still work because grant remains active in backend)", async ({
    request,
    browser,
    adminUser,
  }) => {
    const context = await createTestContext(browser);
    await context.clearCookies();
    await context.close();

    // The refresh token should still be valid even when user browser session is closed
    expect(activeRefreshToken).toBeDefined();
    const refreshRes = await exchangeRefreshToken(request, activeRefreshToken as string);
    expect(refreshRes.status()).toBe(200);
    const refreshedData = await refreshRes.json();
    validateTokenResponseFormat(refreshedData);
    validateIdTokenSecurityAndClaims(refreshedData.id_token, clientId, adminUser.id);

    activeRefreshToken = (refreshedData.refresh_token as string) || activeRefreshToken;
  });

  test("user not logged in, user has given consent (the code and a refresh token should be returned and work)", async ({
    browser,
    db,
    adminUser,
    request,
  }) => {
    const context = await createTestContext(browser);
    const page = await context.newPage();

    const pkce = generatePkce();
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=rstate4&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    await page.goto(authUrl);
    await expect(page).toHaveURL(/\/(fi|en)\/oidc\/login\//);

    // Log in
    const cookie = await createSessionCookie(db, adminUser.id);
    await context.addCookies([cookie]);

    // Automatically authorized after login
    const callbackUrl = await waitForCallbackUrl(page, () => page.reload());
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchange code
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${REFRESH_SECRET}`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "authorization_code",
        code: code || "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });

    expect(tokenRes.status()).toBe(200);
    const tokenData = await tokenRes.json();
    validateTokenResponseFormat(tokenData);
    expect(tokenData.refresh_token).toBeDefined();
    validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);

    // Test that the refresh token WORKS
    const refreshRes = await exchangeRefreshToken(request, tokenData.refresh_token as string);
    expect(refreshRes.status()).toBe(200);
    const refreshedData = await refreshRes.json();
    validateTokenResponseFormat(refreshedData);
    validateIdTokenSecurityAndClaims(refreshedData.id_token, clientId, adminUser.id);

    activeRefreshToken = (refreshedData.refresh_token as string) || (tokenData.refresh_token as string);

    await context.close();
  });

  test("user revokes consent at end (refresh token should NO LONGER work)", async ({ request, db, adminUser }) => {
    // Delete consent and entities
    await db.delete(table.oidcEntity).where(eq(table.oidcEntity.clientId, clientId));
    await db
      .delete(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));

    // Test: The refresh token MUST NOT work when consent is revoked
    expect(activeRefreshToken).toBeDefined();
    const refreshRes = await exchangeRefreshToken(request, activeRefreshToken as string);
    expect(refreshRes.status()).toBe(400);
    const errorData = await refreshRes.json();
    expect(errorData.error).toBe("invalid_grant");
  });
});
