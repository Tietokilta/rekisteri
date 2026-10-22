import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import * as table from "../src/lib/server/db/schema";
import {
  REDIRECT_URI,
  authorize,
  createClient,
  exchangeCode,
  generatePkce,
  startOidcTestServer,
  type OidcTestServer,
} from "./utils/oidc";

// Protocol rules that come from our provider configuration rather than from the login UI.
// Browser-level flows (consent, refresh, logout, members-only) are covered by the e2e tests.

const CLIENT_ID = "protocol-client";
const SECRET = "protocol-secret";
const USER_ID = "protocol-user";

describe("OIDC protocol", () => {
  let server: OidcTestServer;

  function authorizeUrl(params: Record<string, string>) {
    const pkce = generatePkce();
    return `${server.baseUrl}/oidc/authorize?${new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      state: "state",
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      ...params,
    })}`;
  }

  async function redirectFor(url: string) {
    const res = await fetch(url, { redirect: "manual" });
    return new URL(res.headers.get("location") ?? "", server.baseUrl);
  }

  beforeAll(async () => {
    server = await startOidcTestServer();
    await createClient(server.db, { clientId: CLIENT_ID, secret: SECRET, scopes: ["openid", "profile"] });
    await server.db.insert(table.user).values({ id: USER_ID, email: "protocol@example.com" });
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  it("serves discovery at the bare-origin issuer with the configured endpoints", async () => {
    const config = await (await fetch(`${server.baseUrl}/.well-known/openid-configuration`)).json();
    expect(config).toMatchObject({
      issuer: server.baseUrl,
      authorization_endpoint: `${server.baseUrl}/oidc/authorize`,
      token_endpoint: `${server.baseUrl}/oidc/token`,
      userinfo_endpoint: `${server.baseUrl}/oidc/userinfo`,
      jwks_uri: `${server.baseUrl}/oidc/jwks`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    });
  });

  it("rejects the implicit flow", async () => {
    const location = await redirectFor(authorizeUrl({ response_type: "id_token", nonce: "n" }));
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    // Implicit responses use the fragment; it carries an error and no token
    const response = new URLSearchParams(location.hash.slice(1));
    expect(response.get("error")).toBeTruthy();
    expect(response.get("id_token")).toBeNull();
  });

  it("requires PKCE", async () => {
    const url = new URL(authorizeUrl({}));
    url.searchParams.delete("code_challenge");
    url.searchParams.delete("code_challenge_method");
    const location = await redirectFor(url.href);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });

  it("never redirects to an unregistered redirect_uri", async () => {
    const location = await redirectFor(authorizeUrl({ redirect_uri: "https://evil.example/callback" }));
    expect(location.origin).toBe(server.baseUrl);
    expect(location.pathname).toMatch(/^\/(fi|en)\/oidc\/error$/);
  });

  it("rejects a code with the wrong client secret or the wrong PKCE verifier", async () => {
    const { location, pkce } = await authorize(server, { clientId: CLIENT_ID, userId: USER_ID, scope: "openid" });
    const code = location.searchParams.get("code") ?? "";

    const wrongSecret = await exchangeCode(server, {
      clientId: CLIENT_ID,
      secret: "wrong",
      code,
      verifier: pkce.verifier,
    });
    expect(wrongSecret.status).toBe(401);
    expect((await wrongSecret.json()).error).toBe("invalid_client");

    const wrongVerifier = await exchangeCode(server, {
      clientId: CLIENT_ID,
      secret: SECRET,
      code,
      verifier: generatePkce().verifier,
    });
    expect(wrongVerifier.status).toBe(400);
    expect((await wrongVerifier.json()).error).toBe("invalid_grant");
  });

  it("returns a spec-compliant token response", async () => {
    const { location, pkce } = await authorize(server, {
      clientId: CLIENT_ID,
      userId: USER_ID,
      scope: "openid profile",
    });
    const res = await exchangeCode(server, {
      clientId: CLIENT_ID,
      secret: SECRET,
      code: location.searchParams.get("code") ?? "",
      verifier: pkce.verifier,
    });
    expect(res.status).toBe(200);
    const tokens = await res.json();
    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "openid profile" });
    expect(typeof tokens.access_token).toBe("string");
    expect(typeof tokens.id_token).toBe("string");
    expect(tokens.refresh_token).toBeUndefined();
  });

  it("cleanupExpiredTokens removes expired OIDC entities and keeps live ones", async () => {
    const { cleanupExpiredTokens } = await import("../src/lib/server/db/cleanup");
    await server.db.insert(table.oidcEntity).values([
      { id: "expired-entity", kind: "AccessToken", payload: {}, expiresAt: new Date(Date.now() - 60_000) },
      { id: "live-entity", kind: "AccessToken", payload: {}, expiresAt: new Date(Date.now() + 60_000) },
    ]);

    await cleanupExpiredTokens();

    const ids = (await server.db.select({ id: table.oidcEntity.id }).from(table.oidcEntity)).map((row) => row.id);
    expect(ids).not.toContain("expired-entity");
    expect(ids).toContain("live-entity");
    await server.db.delete(table.oidcEntity).where(eq(table.oidcEntity.id, "live-entity"));
  });
});
