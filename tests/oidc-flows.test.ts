import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { RequestEvent } from "@sveltejs/kit";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import { generatePkce, catchRedirect, expectNoAccessToken } from "./utils/oidc";

describe("OIDC Protocol Flow Tests", () => {
  let testDb: TestDatabase;
  let testUserId: string;
  let db: TestDatabase["db"];
  let getOidcProvider: typeof import("../src/lib/server/oidc/provider").getOidcProvider;
  let handleOidcRequest: typeof import("../src/lib/server/oidc/bridge").handleOidcRequest;
  let finishInteraction: typeof import("../src/lib/server/oidc/bridge").finishInteraction;
  let DrizzleOidcAdapter: typeof import("../src/lib/server/oidc/adapter").DrizzleOidcAdapter;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.container.getConnectionUri();
    process.env.PUBLIC_URL = "http://localhost:5173";

    const dbModule = await import("../src/lib/server/db");
    db = dbModule.db;
    const providerModule = await import("../src/lib/server/oidc/provider");
    getOidcProvider = providerModule.getOidcProvider;
    const bridgeModule = await import("../src/lib/server/oidc/bridge");
    handleOidcRequest = bridgeModule.handleOidcRequest;
    finishInteraction = bridgeModule.finishInteraction;
    const adapterModule = await import("../src/lib/server/oidc/adapter");
    DrizzleOidcAdapter = adapterModule.DrizzleOidcAdapter;

    testUserId = "user_test_oidc_123";
    await db.delete(table.oidcConsent);
    await db.delete(table.oidcEntity);
    await db.delete(table.oidcClient);
    await db
      .insert(table.user)
      .values({
        id: testUserId,
        email: "testuser@example.com",
        firstNames: "Test",
        lastName: "User",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("openid-configuration includes /oidc prefix in endpoints", async () => {
    const provider = getOidcProvider();
    const event = {
      request: new Request("http://localhost:5173/oidc/.well-known/openid-configuration"),
      url: new URL("http://localhost:5173/oidc/.well-known/openid-configuration"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect(res.status).toBe(200);
    const config = await res.json();

    expect(config.issuer).toBe("http://localhost:5173/oidc");
    expect(config.authorization_endpoint).toBe("http://localhost:5173/oidc/auth");
    expect(config.token_endpoint).toBe("http://localhost:5173/oidc/token");
    expect(config.userinfo_endpoint).toBeUndefined();
    expect(config.jwks_uri).toBe("http://localhost:5173/oidc/jwks");
    expect(config.end_session_endpoint).toBe("http://localhost:5173/oidc/logout");
  });

  it("authorization_code WITHOUT refresh_token flow", async () => {
    const clientId = "auth-code-no-refresh";
    const clientSecret = "sec_auth_code_secret_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Auth Code No Refresh Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "email"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // Step 1: GET /oidc/auth with PKCE
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email&state=xyz123&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, {
        headers: { host: "localhost:5173" },
      }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    expect([302, 303]).toContain(resAuth.status);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    // Step 2: Grant consent
    const grant = new provider.Grant({
      accountId: testUserId,
      clientId,
    });
    grant.addOIDCScope("openid profile email");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: {
          cookie: `_interaction=${uid}; _interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: (key: string) => (key.startsWith("_interaction") ? uid : undefined) },
    } as unknown as RequestEvent;

    let resumeUrl = "";
    try {
      await finishInteraction(mockAcceptEvent, provider, {
        login: { accountId: testUserId },
        consent: { grantId },
      });
    } catch (e: unknown) {
      resumeUrl = catchRedirect(e);
    }

    const parsedResume = new URL(resumeUrl, "http://localhost:5173");

    // Step 3: GET /oidc/auth/:uid (Resume auth)
    const eventResume = {
      request: new Request(parsedResume.href, {
        headers: {
          cookie: `_interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const callbackParams = new URL(callbackUrl).searchParams;
    const code = callbackParams.get("code") || "";
    expect(code).toBeTruthy();

    // Step 4: Token exchange POST /oidc/token with PKCE verifier
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const eventToken = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: tokenParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resToken = await handleOidcRequest(eventToken, provider);
    const tokenData = await resToken.json();
    expect(resToken.status).toBe(200);
    expectNoAccessToken(tokenData);
    expect(tokenData.refresh_token).toBeUndefined();

    // Verify authorization code is deleted from database after use
    const [deletedCodeRow] = await db.select().from(table.oidcEntity).where(eq(table.oidcEntity.jti, code));
    expect(deletedCodeRow).toBeUndefined();
  });

  it("authorization_code WITH refresh_token flow", async () => {
    const clientId = "auth-code-with-refresh";
    const clientSecret = "sec_auth_code_refresh_secret_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Auth Code With Refresh Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "email", "offline_access"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // Step 1: GET /oidc/auth with PKCE
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile&state=xyz123&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, {
        headers: { host: "localhost:5173" },
      }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    // Step 2: Grant consent
    const grant = new provider.Grant({
      accountId: testUserId,
      clientId,
    });
    grant.addOIDCScope("openid profile email offline_access");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: {
          cookie: `_interaction=${uid}; _interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: (key: string) => (key.startsWith("_interaction") ? uid : undefined) },
    } as unknown as RequestEvent;

    let resumeUrl = "";
    try {
      await finishInteraction(mockAcceptEvent, provider, {
        login: { accountId: testUserId },
        consent: { grantId },
      });
    } catch (e: unknown) {
      resumeUrl = catchRedirect(e);
    }

    const parsedResume = new URL(resumeUrl, "http://localhost:5173");

    // Step 3: GET /oidc/auth/:uid (Resume auth)
    const eventResume = {
      request: new Request(parsedResume.href, {
        headers: {
          cookie: `_interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const callbackParams = new URL(callbackUrl).searchParams;
    const code = callbackParams.get("code") || "";
    expect(code).toBeTruthy();

    // Step 4: Token exchange POST /oidc/token with PKCE verifier
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const eventToken = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: tokenParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resToken = await handleOidcRequest(eventToken, provider);
    const tokenData = await resToken.json();
    expect(resToken.status).toBe(200);
    expectNoAccessToken(tokenData);
    expect(tokenData.refresh_token).toBeDefined();
  });

  it("cleanupExpiredTokens removes expired tokens and interactions", async () => {
    const { cleanupExpiredTokens } = await import("../src/lib/server/db/cleanup");

    const pastDate = new Date(Date.now() - 1000 * 60); // 1 min ago

    await db.insert(table.oidcEntity).values({
      jti: "expired_token_123",
      payload: { sub: testUserId },
      expiresAt: pastDate,
    });

    await db.insert(table.oidcEntity).values({
      jti: "expired_interaction_123",
      payload: { uid: "expired_interaction_123" },
      expiresAt: pastDate,
    });

    await cleanupExpiredTokens();

    const [tokenRow] = await db.select().from(table.oidcEntity).where(eq(table.oidcEntity.jti, "expired_token_123"));
    expect(tokenRow).toBeUndefined();

    const [interactionRow] = await db
      .select()
      .from(table.oidcEntity)
      .where(eq(table.oidcEntity.jti, "expired_interaction_123"));
    expect(interactionRow).toBeUndefined();
  });

  it("auth token generation is rejected after token revocation", async () => {
    const provider = getOidcProvider();
    const clientId = "auth-token-revocation-client";
    const clientSecret = "revocation-secret-12345";
    const redirectUri = "https://oauth.pstmn.io/v1/callback";

    await db.insert(table.oidcClient).values({
      clientId,
      clientSecret: hashClientSecret(clientSecret),
      name: "Revocation Test App",
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "offline_access"],
      type: "authorization_code",
    });

    const pkce = generatePkce();

    // 1. Authorize
    const reqAuthUrl = new URL("http://localhost:5173/oidc/auth");
    reqAuthUrl.searchParams.set("client_id", clientId);
    reqAuthUrl.searchParams.set("redirect_uri", redirectUri);
    reqAuthUrl.searchParams.set("response_type", "code");
    reqAuthUrl.searchParams.set("scope", "openid profile");
    reqAuthUrl.searchParams.set("code_challenge", pkce.challenge);
    reqAuthUrl.searchParams.set("code_challenge_method", "S256");

    const eventAuth = {
      request: new Request(reqAuthUrl.href, {
        headers: { host: "localhost:5173" },
      }),
      url: reqAuthUrl,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({
      accountId: testUserId,
      clientId,
    });
    grant.addOIDCScope("openid profile offline_access");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: {
          cookie: `_interaction=${uid}; _interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: (key: string) => (key.startsWith("_interaction") ? uid : undefined) },
    } as unknown as RequestEvent;

    let resumeUrl = "";
    try {
      await finishInteraction(mockAcceptEvent, provider, {
        login: { accountId: testUserId },
        consent: { grantId },
      });
    } catch (e: unknown) {
      resumeUrl = catchRedirect(e);
    }

    const parsedResume = new URL(resumeUrl, "http://localhost:5173");
    const eventResume = {
      request: new Request(parsedResume.href, {
        headers: {
          cookie: `_interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const code = new URL(callbackUrl).searchParams.get("code") || "";

    // Exchange code for refresh_token
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const eventToken = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: tokenParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resToken = await handleOidcRequest(eventToken, provider);
    const tokenData = await resToken.json();
    expectNoAccessToken(tokenData);
    const refreshToken = tokenData.refresh_token;
    expect(refreshToken).toBeDefined();

    // Revoke grant and tokens for this grantId
    const adapter = new DrizzleOidcAdapter("Grant");
    await adapter.revokeByGrantId(grantId);

    // Attempt token generation with revoked refresh token
    const refreshParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const eventRevokedRefresh = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: refreshParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resRevoked = await handleOidcRequest(eventRevokedRefresh, provider);
    expect(resRevoked.status).toBe(400);
    const revokedData = await resRevoked.json();
    expect(revokedData.error).toBe("invalid_grant");
  });

  it("authorization_code flow with access_token disabled returns only id_token", async () => {
    const clientId = "auth-code-no-access-token";
    const clientSecret = "sec_no_access_token_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "No Access Token App",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // Step 1: GET /oidc/auth
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile&state=xyz123&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, {
        headers: { host: "localhost:5173" },
      }),
      url: new URL(authUrl),
      params: {},
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    expect([302, 303]).toContain(resAuth.status);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    // Step 2: Grant consent
    const grant = new provider.Grant({
      accountId: testUserId,
      clientId,
    });
    grant.addOIDCScope("openid profile");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: {
          cookie: `_interaction=${uid}; _interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: (key: string) => (key.startsWith("_interaction") ? uid : undefined) },
    } as unknown as RequestEvent;

    let resumeUrl = "";
    try {
      await finishInteraction(mockAcceptEvent, provider, {
        login: { accountId: testUserId },
        consent: { grantId },
      });
    } catch (e: unknown) {
      resumeUrl = catchRedirect(e);
    }

    // Step 3: GET resume URL
    const fullResumeUrl = resumeUrl.startsWith("http") ? resumeUrl : `http://localhost:5173${resumeUrl}`;
    const eventResume = {
      request: new Request(fullResumeUrl, {
        headers: { host: "localhost:5173" },
      }),
      url: new URL(fullResumeUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    expect([302, 303]).toContain(resResume.status);
    const finalRedirect = resResume.headers.get("location") || "";
    const code = new URL(finalRedirect).searchParams.get("code") || "";

    // Step 4: POST /oidc/token
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const eventToken = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: tokenParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resToken = await handleOidcRequest(eventToken, provider);
    expect(resToken.status).toBe(200);
    const tokenData = await resToken.json();

    expectNoAccessToken(tokenData);
  });

  it("offline_access scope issues refresh_token when allowed by client registration", async () => {
    const clientId = "offline-access-client";
    const clientSecret = "sec_offline_secret_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Offline Access Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "email", "offline_access"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // Step 1: GET /oidc/auth with offline_access scope
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email%20offline_access&state=xyz123&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, {
        headers: { host: "localhost:5173" },
      }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    // Step 2: Grant consent
    const grant = new provider.Grant({
      accountId: testUserId,
      clientId,
    });
    grant.addOIDCScope("openid profile email offline_access");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: {
          cookie: `_interaction=${uid}; _interaction_resume=${uid}`,
          host: "localhost:5173",
        },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: (key: string) => (key.startsWith("_interaction") ? uid : undefined) },
    } as unknown as RequestEvent;

    let resumeUrl = "";
    try {
      await finishInteraction(mockAcceptEvent, provider, {
        login: { accountId: testUserId },
        consent: { grantId },
      });
    } catch (e: unknown) {
      resumeUrl = catchRedirect(e);
    }

    const fullResumeUrl = resumeUrl.startsWith("http") ? resumeUrl : `http://localhost:5173${resumeUrl}`;
    const eventResume = {
      request: new Request(fullResumeUrl, {
        headers: { host: "localhost:5173" },
      }),
      url: new URL(fullResumeUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const finalRedirect = resResume.headers.get("location") || "";
    const code = new URL(finalRedirect).searchParams.get("code") || "";

    // Step 3: POST /oidc/token
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
      scope: "openid profile email offline_access",
    });

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const eventToken = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: tokenParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resToken = await handleOidcRequest(eventToken, provider);
    expect(resToken.status).toBe(200);
    const tokenData = await resToken.json();

    expectNoAccessToken(tokenData);
    expect(tokenData.refresh_token).toBeDefined();

    // Step 4: POST /oidc/token with refresh_token
    const refreshParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenData.refresh_token,
      scope: "openid profile email",
    });

    const eventRefresh = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
        },
        body: refreshParams.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resRefresh = await handleOidcRequest(eventRefresh, provider);
    expect(resRefresh.status).toBe(200);
    const refreshedData = await resRefresh.json();

    expectNoAccessToken(refreshedData);
    expect(refreshedData.refresh_token).toBeDefined();
  });
});
