import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import type { RequestEvent } from "@sveltejs/kit";
import { hashClientSecret } from "../src/lib/server/oidc/secret";
import { generatePkce, catchRedirect, expectNoAccessToken } from "./utils/oidc";

describe("OIDC Scope-Based Claims Resolution Tests", () => {
  let testDb: TestDatabase;
  let testUserId: string;
  let db: TestDatabase["db"];
  let getOidcProvider: typeof import("../src/lib/server/oidc/provider").getOidcProvider;
  let handleOidcRequest: typeof import("../src/lib/server/oidc/bridge").handleOidcRequest;
  let finishInteraction: typeof import("../src/lib/server/oidc/bridge").finishInteraction;

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

    testUserId = "user_test_oidc_claims";
    await db.delete(table.oidcConsent);
    await db.delete(table.oidcEntity);
    await db.delete(table.oidcClient);

    await db
      .insert(table.user)
      .values({
        id: testUserId,
        email: "student@aalto.fi",
        firstNames: "Matti Oskari",
        lastName: "Meikäläinen",
        isAllowedEmails: true,
        preferredLanguage: "english",
      })
      .onConflictDoNothing();

    await db
      .insert(table.membershipType)
      .values({
        id: "varsinainen_jasen",
        name: { fi: "Varsinainen jäsen", en: "Regular member" },
      })
      .onConflictDoNothing();

    const membershipId = "membership_period_123";
    await db
      .insert(table.membership)
      .values({
        id: membershipId,
        membershipTypeId: "varsinainen_jasen",
        startTime: new Date(Date.now() - 1000 * 60 * 60 * 24),
        endTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      })
      .onConflictDoNothing();

    await db
      .insert(table.member)
      .values({
        id: "member_record_123",
        userId: testUserId,
        membershipId,
        status: "active",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("profile scope returns all profile claims and excludes email/membership claims", async () => {
    const clientId = "profile-scope-client";
    const clientSecret = "sec_profile_secret_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Profile Scope Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile&state=state_profile&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
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

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".", 2)[1], "base64url").toString());

    // Profile scope claims MUST be present
    expect(payload.given_name).toBe("Matti Oskari");
    expect(payload.family_name).toBe("Meikäläinen");
    expect(payload.locale).toBe("en");
    expect(payload.verified_student).toBe(true);

    // Email and membership claims MUST NOT be present
    expect(payload.primary_email).toBeUndefined();
    expect(payload.verified_emails).toBeUndefined();
    expect(payload.optional_emails_allowed).toBeUndefined();
    expect(payload.active_memberships).toBeUndefined();
  });

  it("email scope returns all email claims and excludes profile/membership claims", async () => {
    const clientId = "email-scope-client";
    const clientSecret = "sec_email_secret_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Email Scope Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "email"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email&state=state_email&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid email");
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

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".", 2)[1], "base64url").toString());

    // Email scope claims MUST be present
    expect(payload.primary_email).toBe("student@aalto.fi");
    expect(payload.verified_emails).toContain("student@aalto.fi");
    expect(payload.optional_emails_allowed).toBe(true);

    // Profile and membership claims MUST NOT be present
    expect(payload.given_name).toBeUndefined();
    expect(payload.family_name).toBeUndefined();
    expect(payload.locale).toBeUndefined();
    expect(payload.verified_student).toBeUndefined();
    expect(payload.active_memberships).toBeUndefined();
  });

  it("membership scope returns membership claims and excludes profile/email claims", async () => {
    const clientId = "membership-scope-client";
    const clientSecret = "sec_membership_secret_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Membership Scope Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "membership"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20membership&state=state_membership&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid membership");
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

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".", 2)[1], "base64url").toString());

    // Membership scope claims MUST be present
    expect(payload.active_memberships).toContain("varsinainen_jasen");

    // Profile and email claims MUST NOT be present
    expect(payload.given_name).toBeUndefined();
    expect(payload.family_name).toBeUndefined();
    expect(payload.locale).toBeUndefined();
    expect(payload.verified_student).toBeUndefined();
    expect(payload.primary_email).toBeUndefined();
    expect(payload.verified_emails).toBeUndefined();
    expect(payload.optional_emails_allowed).toBeUndefined();
  });

  it("resolves all scope claims dynamically when full scopes (profile, email, membership) are requested", async () => {
    const clientId = "claims-full-client";
    const clientSecret = "sec_claims_full_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    await db.insert(table.oidcClient).values({
      clientId,
      name: "Full Claims Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "email", "membership"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20profile%20email%20membership&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid profile email membership");
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
    expectNoAccessToken(tokenData);

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".", 2)[1], "base64url").toString());

    // All claims under requested scopes MUST be present
    expect(payload.given_name).toBe("Matti Oskari");
    expect(payload.family_name).toBe("Meikäläinen");
    expect(payload.primary_email).toBe("student@aalto.fi");
    expect(payload.verified_student).toBe(true);
    expect(payload.locale).toBe("en");
    expect(payload.optional_emails_allowed).toBe(true);
    expect(payload.active_memberships).toContain("varsinainen_jasen");
  });

  it("does not support granular claim names as scopes (individual claim names are ignored)", async () => {
    const clientId = "granular-scopes-ignored-client";
    const clientSecret = "sec_granular_ignored_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    // Client only has openid registered
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Granular Scopes Ignored Client",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // Attempting to request claim names 'given_name' and 'primary_email' as scopes
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20given_name%20primary_email&state=state_granular&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: { host: "localhost:5173" },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: () => {} },
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

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".", 2)[1], "base64url").toString());

    // Only standard openid claims must be present; granular claim names were not recognized as scopes
    expect(payload.sub).toBe(testUserId);
    expect(payload.given_name).toBeUndefined();
    expect(payload.primary_email).toBeUndefined();
    expect(payload.family_name).toBeUndefined();
    expect(payload.verified_student).toBeUndefined();
    expect(payload.active_memberships).toBeUndefined();
  });

  it("returns all client configured scopes and claims even if the client app requested only openid", async () => {
    const clientId = "client-configured-scopes-client";
    const clientSecret = "sec_configured_scopes_123";
    const redirectUri = "http://localhost:3000/callback";
    const pkce = generatePkce();

    // Client is configured with openid, profile, email, membership
    await db.insert(table.oidcClient).values({
      clientId,
      name: "Configured Scopes App",
      clientSecret: hashClientSecret(clientSecret),
      redirectUris: [redirectUri],
      scopes: ["openid", "profile", "email", "membership"],
      type: "authorization_code",
    });

    const provider = getOidcProvider();

    // Client app requests ONLY openid in query string
    const authUrl = `http://localhost:5173/oidc/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid&state=state_partial&code_challenge=${pkce.challenge}&code_challenge_method=S256`;
    const eventAuth = {
      request: new Request(authUrl, { headers: { host: "localhost:5173" } }),
      url: new URL(authUrl),
      cookies: { set: () => {}, get: () => {} },
    } as unknown as RequestEvent;

    const resAuth = await handleOidcRequest(eventAuth, provider);
    const loginLocation = resAuth.headers.get("location") || "";
    const uid = loginLocation.split("/").pop() || "";

    const grant = new provider.Grant({ accountId: testUserId, clientId });
    grant.addOIDCScope("openid profile email membership");
    const grantId = await grant.save();

    const mockAcceptEvent = {
      params: { uid },
      request: new Request(`http://localhost:5173/oidc/login/${uid}`, {
        method: "POST",
        headers: { host: "localhost:5173" },
      }),
      url: new URL(`http://localhost:5173/oidc/login/${uid}`),
      cookies: { set: () => {}, get: () => {} },
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

    const payload = JSON.parse(Buffer.from(tokenData.id_token.split(".", 2)[1], "base64url").toString());

    // All claims for all configured client scopes must be returned
    expect(payload.sub).toBe(testUserId);
    expect(payload.given_name).toBe("Matti Oskari");
    expect(payload.family_name).toBe("Meikäläinen");
    expect(payload.locale).toBe("en");
    expect(payload.verified_student).toBe(true);
    expect(payload.primary_email).toBe("student@aalto.fi");
    expect(payload.optional_emails_allowed).toBe(true);
    expect(payload.active_memberships).toContain("varsinainen_jasen");
  });
});
