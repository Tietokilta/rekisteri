import { expect, type Browser, type Page, type Route, type Request } from "@playwright/test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { relations } from "../../src/lib/server/db/relations";
import * as table from "../../src/lib/server/db/schema";
import crypto from "node:crypto";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";

export type TestDb = PostgresJsDatabase<typeof relations>;

export const REDIRECT_URI = "http://localhost:3000/callback";
export const AUTH_CODE_CLIENT_ID = "oidc-e2e-auth-code";
export const AUTH_CODE_SECRET = "sec_e2e_auth_code_secret_123";

export const REFRESH_CLIENT_ID = "oidc-e2e-auth-code-refresh";
export const REFRESH_SECRET = "sec_e2e_auth_code_refresh_secret_123";

export function generatePkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function createSessionCookie(db: TestDb, userId: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = encodeBase64url(bytes);
  const sessionId = encodeHexLowerCase(crypto.createHash("sha256").update(token).digest());
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await db.insert(table.session).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return {
    name: "auth-session",
    value: token,
    url: "http://localhost:4173",
  };
}

export async function createTestContext(browser: Browser) {
  const context = await browser.newContext();
  await context.route(/http:\/\/localhost:3000/, (route: Route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Mock Callback</body></html>" }),
  );
  return context;
}

export async function waitForCallbackUrl(page: Page, action?: () => Promise<unknown>): Promise<URL> {
  if (action) {
    const runAction = async () => {
      try {
        await action();
      } catch {
        // Navigation may redirect to an unhosted test callback URL without failing the test
      }
    };
    const [req] = await Promise.all([
      page.waitForRequest((req: Request) => req.url().startsWith("http://localhost:3000/callback")),
      runAction(),
    ]);
    return new URL(req.url());
  }
  const req = await page.waitForRequest((req: Request) => req.url().startsWith("http://localhost:3000/callback"));
  return new URL(req.url());
}

export function decodeJwt(jwt: string) {
  const parts = jwt.split(".");
  expect(parts.length).toBe(3);

  const headerPart = parts[0] || "";
  const payloadPart = parts[1] || "";
  const signature = parts[2] || "";

  const headerJson = Buffer.from(headerPart, "base64url").toString("utf8");
  const payloadJson = Buffer.from(payloadPart, "base64url").toString("utf8");

  return {
    header: JSON.parse(headerJson) as { alg?: string; kid?: string },
    payload: JSON.parse(payloadJson) as {
      iss?: string;
      aud?: string | string[];
      sub?: string;
      iat?: number;
      exp?: number;
      [key: string]: unknown;
    },
    signature,
  };
}

export function validateIdTokenSecurityAndClaims(
  idTokenStr: string,
  expectedClientId: string,
  expectedUserId: string,
  expectedIssuer = "http://localhost:4173/oidc",
) {
  expect(typeof idTokenStr).toBe("string");
  const { header, payload, signature } = decodeJwt(idTokenStr);

  // 1. Header correctness & security
  expect(header.alg).toBe("RS256");
  expect(header.kid).toBeTruthy();

  // 2. Cryptographic signature present
  expect(signature).toBeTruthy();
  expect(signature.length).toBeGreaterThan(32);

  // 3. Issuer verification
  expect(payload.iss).toBe(expectedIssuer);

  // 4. Audience verification (client_id)
  if (Array.isArray(payload.aud)) {
    expect(payload.aud).toContain(expectedClientId);
  } else {
    expect(payload.aud).toBe(expectedClientId);
  }

  // 5. Subject verification (user ID)
  expect(payload.sub).toBe(expectedUserId);

  // 6. Timestamps security checks
  const nowInSec = Math.floor(Date.now() / 1000);
  expect(typeof payload.iat).toBe("number");
  expect(typeof payload.exp).toBe("number");

  // iat must be recent (within last 60 seconds)
  expect(payload.iat).toBeGreaterThan(nowInSec - 60);
  expect(payload.iat).toBeLessThanOrEqual(nowInSec + 10);

  // exp must be strictly after iat
  expect(payload.exp).toBeGreaterThan(payload.iat || 0);

  return payload;
}

export function validateTokenResponseFormat(tokenData: Record<string, unknown>) {
  expect(typeof tokenData.id_token).toBe("string");
  expect(tokenData.access_token).toBeUndefined();
  expect(tokenData.token_type).toBeUndefined();
}
