import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import type { RequestEvent } from "@sveltejs/kit";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import { generatePkce, catchRedirect, expectNoAccessToken } from "./utils/oidc";

describe("OIDC Security, Validation & Negative Tests", () => {
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

    testUserId = "user_test_oidc_security";
    await db.delete(table.oidcConsent);
    await db.delete(table.oidcEntity);
    await db.delete(table.oidcClient);
    await db.delete(table.auditLog);
    await db.delete(table.user).where(eq(table.user.id, testUserId));
    await db
      .insert(table.user)
      .values({
        id: testUserId,
        email: "user_test_oidc_security@example.com",
        firstNames: "Test",
        lastName: "User",
      })
      .onConflictDoUpdate({
        target: table.user.id,
        set: { email: "user_test_oidc_security@example.com" },
      });
  });

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("rejects token request with invalid client_secret and creates audit log", async () => {
    const clientId = "invalid-secret-client";
    const clientSecret = "sec_correct_secret_123";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Invalid Secret Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: ["http://localhost:3000/callback"],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const basicAuth = Buffer.from(`${clientId}:wrong_secret_xxx`).toString("base64");
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: "dummy_code_123",
      redirect_uri: "http://localhost:3000/callback",
    });

    const event = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
          "x-forwarded-for": "192.168.1.100",
        },
        body: params.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect([400, 401]).toContain(res.status);

    await expect
      .poll(async () => {
        const logs = await db.select().from(table.auditLog).where(eq(table.auditLog.action, "oidc_entity.error"));
        return logs.find((l) => l.targetId === clientId);
      })
      .toBeDefined();

    const logs = await db.select().from(table.auditLog).where(eq(table.auditLog.action, "oidc_entity.error"));
    const secretErrorLog = logs.find((l) => l.targetId === clientId);
    expect(secretErrorLog?.targetType).toBe("oidc_client");
    expect(secretErrorLog?.ipAddress).toBe("192.168.1.100");
  });

  it("redirects to localized error page and logs audit record when non-existent client_id is requested in auth flow", async () => {
    const provider = getOidcProvider();
    const authUrl =
      "http://localhost:5173/oidc/auth?client_id=non_existent_client_xyz&response_type=code&redirect_uri=http://localhost:3000/callback";

    const event = {
      request: new Request(authUrl, {
        headers: {
          host: "localhost:5173",
          "x-forwarded-for": "10.0.0.50",
        },
      }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect([302, 303]).toContain(res.status);

    const location = res.headers.get("location") || "";
    expect(location).toContain("/oidc/error?code=");

    const errorCode = new URL(location, "http://localhost:5173").searchParams.get("code") || "";
    expect(errorCode).toBeTruthy();

    const [log] = await db.select().from(table.auditLog).where(eq(table.auditLog.id, errorCode));

    expect(log).toBeDefined();
    if (!log) throw new Error("Log not found");
    expect(log.action).toBe("oidc_entity.error");
    expect(log.targetType).toBe("oidc_client");
    expect(log.targetId).toBe("non_existent_client_xyz");
    expect(log.ipAddress).toBe("10.0.0.50");
  });

  it("redirects to localized error page and logs audit record when invalid redirect_uri is requested in auth flow", async () => {
    const clientId = "invalid-uri-client";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Invalid URI Client",
      clientSecret: hashClientSecret("secret123"),
      redirectUris: ["http://localhost:3000/callback"],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&response_type=code&redirect_uri=http://unregistered-hacker-domain.com/callback`;

    const event = {
      request: new Request(authUrl, {
        headers: {
          host: "localhost:5173",
          "x-forwarded-for": "172.16.0.1",
        },
      }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect([302, 303]).toContain(res.status);

    const location = res.headers.get("location") || "";
    expect(location).toContain("/oidc/error?code=");

    const errorCode = new URL(location, "http://localhost:5173").searchParams.get("code") || "";
    expect(errorCode).toBeTruthy();

    const [log] = await db.select().from(table.auditLog).where(eq(table.auditLog.id, errorCode));

    expect(log).toBeDefined();
    if (!log) throw new Error("Log not found");
    expect(log.action).toBe("oidc_entity.error");
    expect(log.targetType).toBe("oidc_client");
    expect(log.targetId).toBe(clientId);
    expect(log.ipAddress).toBe("172.16.0.1");
  });

  it("rejects token request with invalid authorization code and creates audit log", async () => {
    const clientId = "invalid-code-client";
    const clientSecret = "sec_invalid_code_secret";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Invalid Code Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: ["http://localhost:3000/callback"],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: "invalid_code_xyz",
      redirect_uri: "http://localhost:3000/callback",
    });

    const event = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
          "x-forwarded-for": "192.168.0.5",
        },
        body: params.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect([400, 401]).toContain(res.status);

    await expect
      .poll(async () => {
        const logs = await db.select().from(table.auditLog).where(eq(table.auditLog.action, "oidc_entity.error"));
        return logs.find((l) => l.targetId === clientId);
      })
      .toBeDefined();

    const logs = await db.select().from(table.auditLog).where(eq(table.auditLog.action, "oidc_entity.error"));
    const invalidGrantLog = logs.find((l) => l.targetId === clientId);
    expect(invalidGrantLog?.targetType).toBe("oidc_client");
    expect(invalidGrantLog?.targetId).toBe(clientId);
    expect(invalidGrantLog?.ipAddress).toBe("192.168.0.5");
  });

  it("does not expose userinfo (/oidc/me) endpoint", async () => {
    const provider = getOidcProvider();
    const event = {
      request: new Request("http://localhost:5173/oidc/me", {
        headers: {
          authorization: "Bearer some_token",
          host: "localhost:5173",
        },
      }),
      url: new URL("http://localhost:5173/oidc/me"),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect([400, 404, 500]).toContain(res.status);
  });

  it("oidc/error page server loader parses error code and returns generic error payload", async () => {
    const { load } = await import("../src/routes/[locale=locale]/(public)/oidc/error/+page.server");
    const mockEvent = {
      url: new URL("http://localhost:5173/fi/oidc/error?code=ERR-TEST-999"),
      params: { locale: "fi" },
    } as unknown as RequestEvent;

    const result = (await load(mockEvent as Parameters<typeof load>[0])) as {
      code: string;
      title: string;
      description: string;
    };
    expect(result.code).toBe("ERR-TEST-999");
    expect(result.title).toBeDefined();
    expect(result.description).toBeDefined();
  });

  it("rejects authorization request when client IP/origin is not in allowedOrigins and redirects to error page", async () => {
    const clientId = "restricted-origin-auth-client";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Restricted Origin Auth Client",
      clientSecret: hashClientSecret("sec_restricted_123"),
      redirectUris: ["http://localhost:3000/callback"],
      allowedOrigins: ["192.168.1.50", "https://trusted-origin.example.com"],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&response_type=code&redirect_uri=http://localhost:3000/callback`;

    const event = {
      request: new Request(authUrl, {
        headers: {
          host: "localhost:5173",
          origin: "https://evil-untrusted-site.com",
          "x-forwarded-for": "10.0.0.99",
        },
      }),
      url: new URL(authUrl),
      params: { locale: "fi" },
      locals: { locale: "fi" },
      getClientAddress: () => "10.0.0.99",
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    let redirectLocation: string;
    try {
      const res = await handleOidcRequest(event, provider);
      redirectLocation = res.headers.get("location") || "";
    } catch (e: unknown) {
      redirectLocation = catchRedirect(e);
    }

    expect(redirectLocation).toContain("/oidc/error?code=");
    const errorCode = new URL(redirectLocation, "http://localhost:5173").searchParams.get("code") || "";
    expect(errorCode).toBeTruthy();

    const [log] = await db.select().from(table.auditLog).where(eq(table.auditLog.id, errorCode));

    expect(log).toBeDefined();
    if (!log) throw new Error("Log not found");
    expect(log.action).toBe("oidc_entity.error");
    expect(log.targetType).toBe("oidc_client");
    expect(log.targetId).toBe(clientId);
    expect((log.metadata as Record<string, unknown> | null)?.error).toBe("disallowed_client_address");
    expect(log.ipAddress).toBe("10.0.0.99");
  });

  it("allows authorization request when client IP matches allowedOrigins", async () => {
    const clientId = "allowed-ip-auth-client";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Allowed IP Auth Client",
      clientSecret: hashClientSecret("sec_allowed_ip_123"),
      redirectUris: ["http://localhost:3000/callback"],
      allowedOrigins: ["192.168.1.50"],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&response_type=code&redirect_uri=http://localhost:3000/callback`;

    const event = {
      request: new Request(authUrl, {
        headers: {
          host: "localhost:5173",
          "x-forwarded-for": "192.168.1.50",
        },
      }),
      url: new URL(authUrl),
      params: { locale: "fi" },
      locals: { locale: "fi" },
      getClientAddress: () => "192.168.1.50",
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect([302, 303]).toContain(res.status);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/oidc/login/");
  });

  it("rejects token exchange when client IP/origin is not in allowedOrigins", async () => {
    const clientId = "restricted-ip-token-client";
    const clientSecret = "sec_restricted_token_123";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Restricted IP Token Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: ["http://localhost:3000/callback"],
      allowedOrigins: ["192.168.1.50"],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: "dummy_code_xyz",
      redirect_uri: "http://localhost:3000/callback",
    });

    const event = {
      request: new Request("http://localhost:5173/oidc/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basicAuth}`,
          host: "localhost:5173",
          "x-forwarded-for": "10.0.0.88",
        },
        body: params.toString(),
      }),
      url: new URL("http://localhost:5173/oidc/token"),
      params: { locale: "fi" },
      locals: { locale: "fi" },
      getClientAddress: () => "10.0.0.88",
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const res = await handleOidcRequest(event, provider);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("unauthorized_client");

    const logs = await db.select().from(table.auditLog).where(eq(table.auditLog.action, "oidc_entity.error"));

    const disallowedLog = logs.find((l) => l.targetId === clientId);
    expect(disallowedLog).toBeDefined();
    expect((disallowedLog?.metadata as Record<string, unknown> | null)?.error).toBe("disallowed_client_address");
    expect(disallowedLog?.ipAddress).toBe("10.0.0.88");
  });

  it("redirects to redirect_uri with access_denied error when user denies consent", async () => {
    const clientId = "consent-deny-client";
    const redirectUri = "http://localhost:3000/callback";
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Consent Deny Client",
      clientSecret: hashClientSecret("sec_deny_123"),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile&state=deny_state_123`;
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

    const mockDenyEvent = {
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
      await finishInteraction(mockDenyEvent, provider, {
        error: "access_denied",
        error_description: "End-User denied authorization",
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
    expect([302, 303]).toContain(resResume.status);
    const callbackUrl = resResume.headers.get("location") || "";
    expect(callbackUrl).toContain("http://localhost:3000/callback");
    const callbackParams = new URL(callbackUrl).searchParams;
    expect(callbackParams.get("error")).toBe("access_denied");
    expect(callbackParams.get("state")).toBe("deny_state_123");
  });

  it("rejects token exchange when PKCE code_verifier fails verification", async () => {
    const clientId = "pkce-fail-client";
    const clientSecret = "sec_pkce_fail_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "PKCE Fail Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
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

    const grant = new provider.Grant({ accountId: testUserId, clientId });
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

    const parsedResume = new URL(resumeUrl, "http://localhost:5173");
    const eventResume = {
      request: new Request(parsedResume.href, {
        headers: { cookie: `_interaction_resume=${uid}`, host: "localhost:5173" },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const code = new URL(callbackUrl).searchParams.get("code") || "";

    // Attempt token exchange with WRONG verifier
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: "wrong_verifier_string_123456789012345678901234567890",
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
    expect([400, 401]).toContain(resToken.status);
    const tokenData = await resToken.json();
    expect(tokenData.error).toBe("invalid_grant");
  });

  it("rejects reuse of authorization code (replay protection)", async () => {
    const clientId = "code-reuse-client";
    const clientSecret = "sec_reuse_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Code Reuse Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid profile");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: { cookie: `_interaction=${uid}; _interaction_resume=${uid}`, host: "localhost:5173" },
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
        headers: { cookie: `_interaction_resume=${uid}`, host: "localhost:5173" },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const code = new URL(callbackUrl).searchParams.get("code") || "";

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const makeTokenRequest = () =>
      handleOidcRequest(
        {
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
        } as unknown as RequestEvent,
        provider,
      );

    // First exchange: MUST succeed
    const res1 = await makeTokenRequest();
    expect(res1.status).toBe(200);
    const res1Data = await res1.json();
    expectNoAccessToken(res1Data);

    // Second exchange (replay): MUST fail with 400 invalid_grant
    const res2 = await makeTokenRequest();
    expect([400, 401]).toContain(res2.status);
    const data2 = await res2.json();
    expect(data2.error).toBe("invalid_grant");
  });

  it("regenerating client secret deletes all oidc_entity records, rejects old secret, and invalidates active refresh tokens", async () => {
    const clientId = "secret-regen-security-client";
    const oldSecret = "sec_old_secret_12345";
    const newSecret = "sec_new_secret_67890";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Secret Regen Security Client",
      clientSecret: hashClientSecret(oldSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "offline_access"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // 1. Authorize and issue tokens
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20offline_access&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid profile offline_access");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: { cookie: `_interaction=${uid}; _interaction_resume=${uid}`, host: "localhost:5173" },
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
        headers: { cookie: `_interaction_resume=${uid}`, host: "localhost:5173" },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const code = new URL(callbackUrl).searchParams.get("code") || "";

    const basicAuthOld = Buffer.from(`${clientId}:${oldSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const resToken = await handleOidcRequest(
      {
        request: new Request("http://localhost:5173/oidc/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${basicAuthOld}`,
            host: "localhost:5173",
          },
          body: tokenParams.toString(),
        }),
        url: new URL("http://localhost:5173/oidc/token"),
        cookies: { set: () => {}, get: () => {} },
      } as unknown as RequestEvent,
      provider,
    );

    expect(resToken.status).toBe(200);
    const tokenData = await resToken.json();
    const refreshToken = tokenData.refresh_token as string;
    expect(refreshToken).toBeDefined();

    // Verify entities are stored in DB
    const initialEntities = await db.select().from(table.oidcEntity).where(eq(table.oidcEntity.clientId, clientId));
    expect(initialEntities.length).toBeGreaterThan(0);

    // 2. Perform Secret Regeneration (matching regenerateOidcClientSecret action)
    await db
      .update(table.oidcClient)
      .set({ clientSecret: hashClientSecret(newSecret) })
      .where(eq(table.oidcClient.clientId, clientId));
    await db.delete(table.oidcEntity).where(eq(table.oidcEntity.clientId, clientId));
    await db.delete(table.oidcConsent).where(eq(table.oidcConsent.clientId, clientId));

    // Verify all oidc_entity records for this client were purged
    const purgedEntities = await db.select().from(table.oidcEntity).where(eq(table.oidcEntity.clientId, clientId));
    expect(purgedEntities.length).toBe(0);

    // 3. Negative check: Old secret is rejected
    const basicAuthNew = Buffer.from(`${clientId}:${newSecret}`).toString("base64");
    const refreshParamsOldSecret = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const resOldSecret = await handleOidcRequest(
      {
        request: new Request("http://localhost:5173/oidc/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${basicAuthOld}`,
            host: "localhost:5173",
          },
          body: refreshParamsOldSecret.toString(),
        }),
        url: new URL("http://localhost:5173/oidc/token"),
        cookies: { set: () => {}, get: () => {} },
      } as unknown as RequestEvent,
      provider,
    );
    expect([400, 401]).toContain(resOldSecret.status);

    // 4. Negative check: Even with new secret, previously issued refresh token is rejected because entities were purged
    const resNewSecret = await handleOidcRequest(
      {
        request: new Request("http://localhost:5173/oidc/token", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: `Basic ${basicAuthNew}`,
            host: "localhost:5173",
          },
          body: refreshParamsOldSecret.toString(),
        }),
        url: new URL("http://localhost:5173/oidc/token"),
        cookies: { set: () => {}, get: () => {} },
      } as unknown as RequestEvent,
      provider,
    );
    expect(resNewSecret.status).toBe(400);
    const newSecretErr = await resNewSecret.json();
    expect(newSecretErr.error).toBe("invalid_grant");
  });

  it("user consent revocation purges all associated oidc_entity records and invalidates active refresh tokens", async () => {
    const clientId = "consent-revoke-security-client";
    const clientSecret = "sec_consent_revoke_12345";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Consent Revoke Security Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "offline_access"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // 1. Authorize and issue tokens
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20offline_access&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const consentId = crypto.randomUUID();
    await db.insert(table.oidcConsent).values({
      id: consentId,
      userId: testUserId,
      clientId,
    });

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid profile offline_access");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: { cookie: `_interaction=${uid}; _interaction_resume=${uid}`, host: "localhost:5173" },
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
        headers: { cookie: `_interaction_resume=${uid}`, host: "localhost:5173" },
      }),
      url: parsedResume,
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resResume = await handleOidcRequest(eventResume, provider);
    const callbackUrl = resResume.headers.get("location") || "";
    const code = new URL(callbackUrl).searchParams.get("code") || "";

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce.verifier,
    });

    const resToken = await handleOidcRequest(
      {
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
      } as unknown as RequestEvent,
      provider,
    );

    expect(resToken.status).toBe(200);
    const tokenData = await resToken.json();
    const refreshToken = tokenData.refresh_token as string;
    expect(refreshToken).toBeDefined();

    // 2. Perform Consent Revocation via DrizzleOidcAdapter
    const adapter = new DrizzleOidcAdapter("Grant");
    await adapter.revokeByGrantId(consentId);

    // Verify oidcConsent record is deleted
    const [remainingConsent] = await db
      .select()
      .from(table.oidcConsent)
      .where(and(eq(table.oidcConsent.userId, testUserId), eq(table.oidcConsent.clientId, clientId)));
    expect(remainingConsent).toBeUndefined();

    // Verify all oidc_entity records tied to this consent are deleted
    const remainingEntities = await db.select().from(table.oidcEntity).where(eq(table.oidcEntity.consentId, consentId));
    expect(remainingEntities.length).toBe(0);

    // 3. Negative check: Refresh token fails
    const refreshParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const resRefresh = await handleOidcRequest(
      {
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
      } as unknown as RequestEvent,
      provider,
    );
    expect(resRefresh.status).toBe(400);
    const refreshErr = await resRefresh.json();
    expect(refreshErr.error).toBe("invalid_grant");
  });
});
