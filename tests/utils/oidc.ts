import crypto from "node:crypto";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./db";
import * as table from "../../src/lib/server/db/schema";

export const REDIRECT_URI = "https://app.example.com/callback";

export function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Runs oidc-provider on a real HTTP server, the same way src/oidc-mount.ts serves it in
 * production, against a fresh test database.
 */
export async function startOidcTestServer() {
  const testDb = await createTestDatabase();

  // The issuer comes from PUBLIC_URL, so pick the port before the provider module loads
  const app: { handler?: RequestListener } = {};
  const server: Server = createServer((req, res) => app.handler?.(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Under vitest, $env/dynamic is a snapshot taken when Vite starts, so process.env changes don't
  // reach it. Override the parsed env instead, before the DB and provider modules read it.
  const { env } = await import("../../src/lib/server/env");
  Object.assign(env, { DATABASE_URL: testDb.container.getConnectionUri(), PUBLIC_URL: baseUrl, OIDC_ENABLED: true });

  const { getOidcProvider } = await import("../../src/lib/server/oidc/provider");
  const { finishInteraction } = await import("../../src/lib/server/oidc/interaction");
  const provider = getOidcProvider();
  app.handler = provider.callback() as RequestListener;

  return {
    baseUrl,
    db: testDb.db,
    provider,
    finishInteraction,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await stopTestDatabase(testDb);
    },
  };
}

export type OidcTestServer = Awaited<ReturnType<typeof startOidcTestServer>>;

export async function createClient(
  db: TestDatabase["db"],
  values: { clientId: string; secret: string; scopes: string[]; requireActiveMembership?: boolean },
) {
  const { hashClientSecret } = await import("../../src/lib/server/oidc/secret");
  await db.insert(table.oidcClient).values({
    clientId: values.clientId,
    name: values.clientId,
    clientSecret: hashClientSecret(values.secret),
    redirectUris: [REDIRECT_URI],
    scopes: values.scopes,
    requireActiveMembership: values.requireActiveMembership ?? false,
  });
}

/** Minimal cookie jar: enough for the provider's own cookies and the Rekisteri session cookie. */
class CookieJar {
  private cookies = new Map<string, string>();

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

  store(res: Response) {
    for (const header of res.headers.getSetCookie()) {
      const [pair = ""] = header.split(";", 1);
      const eq = pair.indexOf("=");
      const value = pair.slice(eq + 1);
      if (value) this.cookies.set(pair.slice(0, eq), value);
      else this.cookies.delete(pair.slice(0, eq));
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function signedInJar(db: TestDatabase["db"], userId: string) {
  const token = crypto.randomBytes(18).toString("base64url");
  await db.insert(table.session).values({
    id: crypto.createHash("sha256").update(token).digest("hex"),
    userId,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const jar = new CookieJar();
  jar.set("auth-session", token);
  return jar;
}

async function get(url: string, jar: CookieJar) {
  const res = await fetch(url, { redirect: "manual", headers: { cookie: jar.header() } });
  jar.store(res);
  return res;
}

/**
 * Runs the authorization code flow as a signed-in user who approves the consent screen, the way
 * the login page does it, and returns the URL the provider finally redirects the browser to.
 */
export async function authorize(
  server: OidcTestServer,
  {
    clientId,
    userId,
    scope,
    pkce = generatePkce(),
  }: { clientId: string; userId: string; scope: string; pkce?: ReturnType<typeof generatePkce> },
) {
  const jar = await signedInJar(server.db, userId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope,
    state: "state",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  });
  const start = await get(`${server.baseUrl}/oidc/authorize?${params}`, jar);
  const location = new URL(start.headers.get("location") ?? "", server.baseUrl);
  // Errors before any interaction (unknown client, bad redirect_uri…) end here
  if (!location.pathname.startsWith("/oidc/login/")) return { location, pkce };

  const uid = location.pathname.split("/").pop() ?? "";
  const interaction = await server.provider.Interaction.find(uid);
  if (!interaction) throw new Error(`Interaction ${uid} not found`);
  const grant = new server.provider.Grant({ accountId: userId, clientId });
  grant.addOIDCScope(scope);
  const grantId = await grant.save();

  let returnTo = "";
  try {
    await server.finishInteraction(interaction, { login: { accountId: userId }, consent: { grantId } });
  } catch (error) {
    returnTo = (error as { location?: string }).location ?? "";
  }
  const resumed = await get(returnTo, jar);
  return { location: new URL(resumed.headers.get("location") ?? "", server.baseUrl), pkce };
}

export async function exchangeCode(
  server: OidcTestServer,
  { clientId, secret, code, verifier }: { clientId: string; secret: string; code: string; verifier: string },
) {
  return fetch(`${server.baseUrl}/oidc/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
}

/** Signs in, exchanges the code and returns the token response. */
export async function getTokens(
  server: OidcTestServer,
  options: { clientId: string; secret: string; userId: string; scope: string },
) {
  const { location, pkce } = await authorize(server, options);
  const code = location.searchParams.get("code");
  if (!code) throw new Error(`No code in ${location.href}`);
  const res = await exchangeCode(server, { ...options, code, verifier: pkce.verifier });
  if (res.status !== 200) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string; id_token: string; scope: string };
}

export async function userinfo(server: OidcTestServer, accessToken: string) {
  const res = await fetch(`${server.baseUrl}/oidc/userinfo`, { headers: { authorization: `Bearer ${accessToken}` } });
  return { status: res.status, claims: (res.status === 200 ? await res.json() : {}) as Record<string, unknown> };
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split(".", 2)[1] ?? "", "base64url").toString("utf8"));
}
