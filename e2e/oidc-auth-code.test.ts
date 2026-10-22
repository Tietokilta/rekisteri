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
  getBaseUrl,
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
    const authUrl = `${getBaseUrl()}/oidc/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state1&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

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
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
        origin: getBaseUrl(),
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

    // Verify token response format (id_token + Bearer access_token)
    validateTokenResponseFormat(tokenData);
    expect(tokenData.refresh_token).toBeUndefined();

    // Verify ID Token JWT structure, algorithms, signature, issuer, audience, subject and timestamps
    const idClaims = validateIdTokenSecurityAndClaims(tokenData.id_token, clientId, adminUser.id);
    expect(idClaims.sub).toBe(adminUser.id);

    // The access token works at the userinfo endpoint and returns the same subject
    const userinfoRes = await request.get(`${getBaseUrl()}/oidc/userinfo`, {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
    });
    expect(userinfoRes.status()).toBe(200);
    const userinfo = await userinfoRes.json();
    expect(userinfo.sub).toBe(adminUser.id);
    expect(userinfo.locale).toBeTruthy();
    expect(typeof userinfo.aalto_email_verified).toBe("boolean");

    // Security Check: Attempt code exchange with WRONG client secret -> MUST fail
    const badSecretRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:wrong_secret`).toString("base64")}`,
        origin: getBaseUrl(),
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
    const reuseCodeRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
        origin: getBaseUrl(),
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
    const authUrl = `${getBaseUrl()}/oidc/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state2&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

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
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
        origin: getBaseUrl(),
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
    const authUrl = `${getBaseUrl()}/oidc/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state3&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

    // Automatic authorization!
    const callbackUrl = await waitForCallbackUrl(page, () => page.goto(authUrl));
    const code = callbackUrl.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(callbackUrl.searchParams.get("state")).toBe("state3");

    // Exchange code and verify id_token and claims
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
        origin: getBaseUrl(),
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
    const authUrl = `${getBaseUrl()}/oidc/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=openid%20profile&state=state4&code_challenge=${pkce.challenge}&code_challenge_method=S256`;

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
    const tokenRes = await request.post(`${getBaseUrl()}/oidc/token`, {
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${AUTH_CODE_SECRET}`).toString("base64")}`,
        origin: getBaseUrl(),
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

  test("openid-configuration discovery endpoint matches conservative profile", async ({ request }) => {
    const res = await request.get(`${getBaseUrl()}/.well-known/openid-configuration`);
    expect(res.status()).toBe(200);
    const config = await res.json();

    expect(config.issuer).toBe(getBaseUrl());
    expect(config.authorization_endpoint).toBe(`${getBaseUrl()}/oidc/authorize`);
    expect(config.token_endpoint).toBe(`${getBaseUrl()}/oidc/token`);
    expect(config.userinfo_endpoint).toBe(`${getBaseUrl()}/oidc/userinfo`);
    expect(config.jwks_uri).toBe(`${getBaseUrl()}/oidc/jwks`);
    expect(config.end_session_endpoint).toBe(`${getBaseUrl()}/oidc/logout`);

    expect(config.token_endpoint_auth_methods_supported).toEqual(["client_secret_basic", "client_secret_post"]);
    expect(config.pushed_authorization_request_endpoint).toBeUndefined();
    expect(config.dpop_signing_alg_values_supported).toBeUndefined();
    // Provider-wide list; each client is still limited to "query" by its registered response_modes
    expect(config.response_modes_supported).toEqual(["form_post", "fragment", "query"]);
    expect(config.response_types_supported).toEqual(["code"]);
    expect(config.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(config.code_challenge_methods_supported).toEqual(["S256"]);
    expect(config.id_token_signing_alg_values_supported).toEqual(["RS256"]);
    expect(config.authorization_response_iss_parameter_supported).toBe(true);
    expect(config.claims_parameter_supported).toBe(false);
    expect(config.request_uri_parameter_supported).toBe(false);

    expect(config.scopes_supported).toEqual(
      expect.arrayContaining(["openid", "offline_access", "profile", "email", "membership"]),
    );
    expect(config.claims_supported).toEqual(
      expect.arrayContaining([
        "sub",
        "iss",
        "aud",
        "iat",
        "exp",
        "auth_time",
        "given_name",
        "family_name",
        "locale",
        "aalto_email_verified",
        "email",
        "email_verified",
        "verified_emails",
        "optional_emails_allowed",
        "active_memberships",
      ]),
    );
  });
});
