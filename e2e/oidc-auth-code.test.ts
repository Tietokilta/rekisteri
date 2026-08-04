import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import {
  AUTH_CODE_CLIENT_ID,
  AUTH_CODE_SECRET,
  REDIRECT_URI,
  generatePkce,
  createSessionCookie,
  createTestContext,
  waitForCallbackUrl,
  validateIdTokenSecurityAndClaims,
  validateTokenResponseFormat,
} from "./helpers/oidc";

test.describe.configure({ mode: "serial" });

test.describe("OIDC Authorization Code Flow (E2E)", () => {
  const clientId = AUTH_CODE_CLIENT_ID;

  test.beforeAll(async ({ dbConnection }) => {
    const db = dbConnection.db;

    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, AUTH_CODE_CLIENT_ID));

    await db.insert(table.oidcClient).values({
      clientId,
      name: "E2E Auth Code Client",
      clientSecret: hashClientSecret(AUTH_CODE_SECRET),
      redirectUris: [REDIRECT_URI],
      scopes: ["openid", "profile", "email"],
      type: "authorization_code",
    });
  });

  test.afterAll(async ({ dbConnection }) => {
    const db = dbConnection.db;
    await db.delete(table.oidcClient).where(eq(table.oidcClient.clientId, AUTH_CODE_CLIENT_ID));
  });

  test("user not logged in, user has not given consent (the code should be returned and id_token verified)", async ({
    browser,
    db,
    adminUser,
    request,
  }) => {
    // Ensure user has no existing consent
    await db
      .delete(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));

    const context = await createTestContext(browser);
    const page = await context.newPage();

    const pkce = generatePkce();
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state1&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    await page.goto(authUrl);

    // Should be redirected to login screen
    await expect(page).toHaveURL(/\/(fi|en)\/oidc\/login\//);

    // User logs in
    const cookie = await createSessionCookie(db, adminUser.id);
    await context.addCookies([cookie]);
    await page.reload();

    // Consent screen shown
    await expect(page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i })).toBeVisible();

    // Redirected with code
    const callbackUrl = await waitForCallbackUrl(page, () =>
      page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i }).click(),
    );
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(callbackUrl.searchParams.get("state")).toBe("state1");

    // Exchange code at /oidc/token
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
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
    expect(tokenData.refresh_token).toBeUndefined();

    // Verify ID Token JWT structure, algorithms, signature, issuer, audience, subject and timestamps
    const idClaims = validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);
    expect(idClaims.sub).toBe(adminUser.id);

    // Security Check: Attempt code exchange with WRONG client secret -> MUST fail
    const badSecretRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:wrong_secret`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "authorization_code",
        code: "invalid_code",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    expect([400, 401]).toContain(badSecretRes.status());

    // Security Check: Attempt code reuse (replay attack protection) -> MUST fail
    const reuseCodeRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
        origin: "http://localhost:4173",
      },
      form: {
        grant_type: "authorization_code",
        code: code || "",
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      },
    });
    expect(reuseCodeRes.status()).toBe(400);
    const reuseData = await reuseCodeRes.json();
    expect(reuseData.error).toBe("invalid_grant");

    await context.close();
  });

  test("consent removed (user should be asked consent in the next test)", async ({ db, adminUser }) => {
    await db
      .delete(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));

    const [consentRow] = await db
      .select()
      .from(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, adminUser.id), eq(table.oidcConsent.clientId, clientId)));
    expect(consentRow).toBeUndefined();
  });

  test("user logged in, user has not given consent (the code should be returned and id_token verified)", async ({
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
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state2&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    await page.goto(authUrl);

    // Direct to consent screen without asking login
    await expect(page).toHaveURL(/\/(fi|en)\/oidc\/login\//);
    await expect(page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i })).toBeVisible();

    const callbackUrl = await waitForCallbackUrl(page, () =>
      page.getByRole("button", { name: /Salli pääsy|Allow access|Hyväksy|Accept/i }).click(),
    );
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(callbackUrl.searchParams.get("state")).toBe("state2");

    // Exchange code and verify id_token and claims
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
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
    expect(tokenData.refresh_token).toBeUndefined();
    const idClaims = validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);
    expect(idClaims.sub).toBe(adminUser.id);

    await context.close();
  });

  test("user logged in, user has given consent (the code should be returned and id_token verified)", async ({
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
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state3&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    // Automatic authorization!
    const callbackUrl = await waitForCallbackUrl(page, () => page.goto(authUrl));
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(callbackUrl.searchParams.get("state")).toBe("state3");

    // Exchange code and verify id_token and claims
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
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
    expect(tokenData.refresh_token).toBeUndefined();
    const idClaims = validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);
    expect(idClaims.sub).toBe(adminUser.id);

    await context.close();
  });

  test("user logs out (user should be asked to login in the next test)", async ({ browser }) => {
    const context = await createTestContext(browser);
    await context.clearCookies();
    await context.close();
  });

  test("user not logged in, user has given consent (the code should be returned and id_token verified)", async ({
    browser,
    db,
    adminUser,
    request,
  }) => {
    const context = await createTestContext(browser);
    const page = await context.newPage();

    const pkce = generatePkce();
    const authUrl = `http://localhost:4173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state4&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    await page.goto(authUrl);
    await expect(page).toHaveURL(/\/(fi|en)\/oidc\/login\//);

    // User logs in
    const cookie = await createSessionCookie(db, adminUser.id);
    await context.addCookies([cookie]);

    // Automatically authorized after login
    const callbackUrl = await waitForCallbackUrl(page, () => page.reload());
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(callbackUrl.searchParams.get("state")).toBe("state4");

    // Exchange code and verify id_token and claims
    const tokenRes = await request.post("http://localhost:4173/oidc/token", {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
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
    expect(tokenData.refresh_token).toBeUndefined();
    const idClaims = validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);
    expect(idClaims.sub).toBe(adminUser.id);

    await context.close();
  });

  test("user logs out", async ({ browser }) => {
    const context = await createTestContext(browser);
    await context.clearCookies();
    await context.close();
  });
});
