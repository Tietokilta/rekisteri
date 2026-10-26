/**
 * @file provider.ts
 * @description OIDC Identity Provider Configuration & Instance Management.
 *
 * Configures the `oidc-provider` instance for Rekisteri, including:
 * - Signing keys from OIDC_SIGNING_KEY_JWK (one key or a set, for rotation), with RFC 7638 thumbprints as `kid`.
 * - Drizzle ORM database adapter integration.
 * - Dynamic user account lookup & claim resolution (profile, email, Aalto email verification, active memberships).
 * - Custom client secret verification.
 * - Custom error rendering and redirection to localized error pages.
 * - Hot Module Replacement (HMR) state preservation in development mode.
 */

import Provider, { interactionPolicy, type Configuration, type KoaContextWithOIDC } from "oidc-provider";
import { generateKeyPairSync, createHash, createPrivateKey, randomBytes } from "node:crypto";
import { dev, building } from "$app/environment";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { DrizzleOidcAdapter } from "./adapter";
import { env } from "$lib/server/env";
import { preferredLanguageToLocale } from "$lib/i18n/routing";
import { OIDC_SCOPES } from "$lib/shared/oidc";
import { verifyClientSecret } from "./secret";
import { createAuditLog } from "$lib/server/audit";
import { sessionCookieName, validateSessionToken } from "$lib/server/auth/session";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";
import { canUseClient } from "./access";
import { membershipTypeAt } from "$lib/server/membership/status";

/**
 * Constructs the canonical OIDC issuer URL from environment configuration.
 * e.g., "https://rekisteri.tietokilta.fi" (no path, so discovery is at /.well-known/openid-configuration)
 */
function getIssuerUrl(): string {
  return new URL(env.PUBLIC_URL).origin;
}

// Preserve signing key and Provider instance across Vite HMR reloads in development mode
const globalForOidc = globalThis as unknown as {
  __oidcJwks?: Record<string, unknown>[];
  __oidcCookieKeys?: string[];
  __oidcProvider?: Provider;
};

export function calculateRfc7638Thumbprint(jwk: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash("sha256").update(canonicalJson).digest("base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses OIDC_SIGNING_KEY_JWK: Base64 of either JSON (one private JWK or a JWK Set, `{"keys": [...]}`)
 * or PEM (one or more private key blocks, as Terraform's tls_private_key outputs). With several keys,
 * the first signs new tokens and the others are only published, so tokens they signed keep
 * verifying. That's how keys are rotated: put the new key first, deploy, and drop the old one once
 * its tokens have expired.
 */
export function parseSigningKeys(input: string): Record<string, unknown>[] | null {
  const trimmed = input.trim();
  // Strictly reject anything that isn't Base64 (e.g. raw JSON)
  if (!trimmed || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) return null;

  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  let keys: unknown[];
  try {
    if (decoded.includes("-----BEGIN")) {
      const blocks = decoded.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g) ?? [];
      keys = blocks.map((pem) => createPrivateKey(pem).export({ format: "jwk" }));
    } else {
      const parsed: unknown = JSON.parse(decoded);
      keys = isRecord(parsed) && Array.isArray(parsed.keys) ? parsed.keys : [parsed];
    }
  } catch {
    return null;
  }
  // RSA only: the kid thumbprint and the RS256 default assume RSA keys
  if (keys.length === 0 || keys.some((key) => !(isRecord(key) && key.kty === "RSA"))) return null;
  return keys as Record<string, unknown>[];
}

function withKeyDefaults(key: Record<string, unknown>): Record<string, unknown> {
  return { ...key, kid: calculateRfc7638Thumbprint(key), use: key.use ?? "sig", alg: key.alg ?? "RS256" };
}

/**
 * The provider's signing keys. A missing key is an error in production: a generated key would
 * change on every restart and make all issued tokens unverifiable. In dev and tests a throwaway
 * key is generated instead.
 */
export function getSigningKeys(): Record<string, unknown>[] {
  if (globalForOidc.__oidcJwks) return globalForOidc.__oidcJwks;

  let keys: Record<string, unknown>[];
  if (env.OIDC_SIGNING_KEY_JWK) {
    const parsed = parseSigningKeys(env.OIDC_SIGNING_KEY_JWK);
    if (!parsed) throw new Error("[OIDC] OIDC_SIGNING_KEY_JWK is not a Base64-encoded JWK or JWK Set");
    keys = parsed.map((key) => withKeyDefaults(key));
  } else if (!dev && !building && !env.TEST && env.NODE_ENV === "production") {
    throw new Error(
      "[OIDC] OIDC_SIGNING_KEY_JWK is required in production (generate one with `pnpm oidc:generate-key`)",
    );
  } else {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    keys = [withKeyDefaults(privateKey.export({ format: "jwk" }) as Record<string, unknown>)];
  }

  globalForOidc.__oidcJwks = keys;
  return keys;
}

/**
 * Secrets for signing the provider's cookies (_session, _interaction), from OIDC_COOKIE_KEYS. Signing
 * stops other *.tietokilta.fi sites from planting those cookies. Like a key set, the first secret
 * signs and all of them verify, so rotating means adding a new one first. Required in production;
 * dev and tests get a throwaway secret.
 */
export function getCookieKeys(): string[] {
  if (globalForOidc.__oidcCookieKeys) return globalForOidc.__oidcCookieKeys;

  let keys = (env.OIDC_COOKIE_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.some((key) => key.length < 32)) {
    throw new Error("[OIDC] Each OIDC_COOKIE_KEYS secret must be at least 32 characters");
  }
  if (keys.length === 0) {
    if (!dev && !building && !env.TEST && env.NODE_ENV === "production") {
      throw new Error("[OIDC] OIDC_COOKIE_KEYS is required in production (e.g. `openssl rand -base64 32`)");
    }
    keys = [randomBytes(32).toString("base64url")];
  }

  globalForOidc.__oidcCookieKeys = keys;
  return keys;
}

/**
 * Build dynamic claims mapping registry from shared OIDC definitions.
 */
const claimsRegistry: Record<string, string[]> = {};
for (const scope of OIDC_SCOPES) {
  claimsRegistry[scope.key] = [...scope.claims];
}

/**
 * Allowed asymmetric token signing algorithms.
 * Disables weak algorithms (HS256, HS384, HS512, none).
 */
const SIGNING_ALGS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

// Same client address source as SvelteKit's adapter-node (ADDRESS_HEADER, e.g. X-Client-IP on Azure)
function getKoaIp(ctx: unknown): string | undefined {
  const koaCtx = ctx as
    { get?: (header: string) => string | undefined; req?: { socket?: { remoteAddress?: string } } } | undefined;
  if (!koaCtx) return undefined;
  const fromHeader = typeof koaCtx.get === "function" ? koaCtx.get(env.ADDRESS_HEADER) : undefined;
  return fromHeader?.split(",", 1)[0]?.trim() || koaCtx.req?.socket?.remoteAddress;
}

function getKoaUserAgent(ctx: unknown): string | undefined {
  const koaCtx = ctx as { get?: (header: string) => string | undefined } | undefined;
  if (koaCtx && typeof koaCtx.get === "function") {
    return koaCtx.get("user-agent") || undefined;
  }
  return undefined;
}

function extractAuditContext(ctx: unknown, fallbackClientId?: string) {
  const koaCtx = ctx as Record<string, unknown> | undefined;
  const req = koaCtx?.req as { event?: { locals?: { user?: { id?: string } } } } | undefined;
  const oidcCtx = koaCtx?.oidc as Record<string, unknown> | undefined;
  const state = koaCtx?.state as Record<string, unknown> | undefined;
  const locals = koaCtx?.locals as Record<string, unknown> | undefined;

  const userId =
    ((oidcCtx?.session as Record<string, unknown> | undefined)?.accountId as string | undefined) ||
    ((oidcCtx?.account as Record<string, unknown> | undefined)?.accountId as string | undefined) ||
    req?.event?.locals?.user?.id ||
    (((locals as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined)?.id as
      string | undefined) ||
    ((state?.user as Record<string, unknown> | undefined)?.id as string | undefined);

  let clientId =
    ((oidcCtx?.client as Record<string, unknown> | undefined)?.clientId as string | undefined) ||
    fallbackClientId ||
    ((oidcCtx?.params as Record<string, unknown> | undefined)?.client_id as string | undefined);

  if (!clientId && koaCtx && typeof koaCtx.get === "function") {
    const authHeader = koaCtx.get("authorization");
    if (authHeader && typeof authHeader === "string" && authHeader.toLowerCase().startsWith("basic ")) {
      try {
        const credentials = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
        const colonIdx = credentials.indexOf(":");
        if (colonIdx !== -1) {
          clientId = credentials.slice(0, Math.max(0, colonIdx));
        }
      } catch {
        // ignore parsing error
      }
    }
  }

  return {
    userId,
    clientId,
    ipAddress: getKoaIp(ctx),
    userAgent: getKoaUserAgent(ctx),
    path: (koaCtx?.path as string) || undefined,
    url: (koaCtx?.url as string) || undefined,
  };
}

/**
 * oidc-provider keeps its own session cookie, separate from Rekisteri's. On its own, that session
 * would keep signing apps in after the user logs out of Rekisteri (or an admin revokes the session).
 * So the login prompt also requires a valid Rekisteri session for the same account; without one,
 * the user is sent to the login page (or gets `login_required` with `prompt=none`).
 */
function buildInteractionPolicy() {
  const policy = interactionPolicy.base();
  policy.get("login")?.checks.add(
    new interactionPolicy.Check(
      "rekisteri_session",
      "Rekisteri session is missing or belongs to another user",
      async (ctx: KoaContextWithOIDC) => {
        const accountId = ctx.oidc.session?.accountId;
        // No provider session is handled by the built-in no_session check; a login just
        // completed in this interaction is the Rekisteri login itself.
        if (!accountId || ctx.oidc.result?.login) return interactionPolicy.Check.NO_NEED_TO_PROMPT;

        const token = ctx.cookies.get(sessionCookieName, { signed: false });
        if (!token) return interactionPolicy.Check.REQUEST_PROMPT;
        const { user: sessionUser } = await validateSessionToken(token);
        return sessionUser?.id === accountId
          ? interactionPolicy.Check.NO_NEED_TO_PROMPT
          : interactionPolicy.Check.REQUEST_PROMPT;
      },
    ),
  );
  policy.get("login")?.checks.add(
    // An existing session and grant would otherwise skip the login page, which is where
    // members-only clients turn away users without an active membership
    new interactionPolicy.Check(
      "active_membership",
      "Client requires an active membership",
      async (ctx: KoaContextWithOIDC) => {
        const accountId = ctx.oidc.session?.accountId;
        if (!accountId || !ctx.oidc.client || ctx.oidc.result?.login) return interactionPolicy.Check.NO_NEED_TO_PROMPT;
        return (await canUseClient(accountId, ctx.oidc.client.clientId))
          ? interactionPolicy.Check.NO_NEED_TO_PROMPT
          : interactionPolicy.Check.REQUEST_PROMPT;
      },
    ),
  );
  return policy;
}

/**
 * Master configuration object for `oidc-provider`.
 */
const configuration: Configuration = {
  // Enforce strong asymmetric token signing algorithms only (disables HS256, HS384, HS512, and none)
  enabledJWA: {
    idTokenSigningAlgValues: [...SIGNING_ALGS],
    clientAuthSigningAlgValues: [...SIGNING_ALGS],
    requestObjectSigningAlgValues: [...SIGNING_ALGS],
    introspectionSigningAlgValues: [...SIGNING_ALGS],
    authorizationSigningAlgValues: [...SIGNING_ALGS],
  },

  // Restrict client authentication methods to shared secret schemes (disables private_key_jwt and none)
  clientAuthMethods: ["client_secret_basic", "client_secret_post"],

  // Use custom Drizzle ORM adapter for database storage of clients, grants, tokens, and sessions
  adapter: DrizzleOidcAdapter,

  extraClientMetadata: {
    properties: ["scopes"],
  },

  /**
   * Account lookup and dynamic claim resolution handler.
   * Called by oidc-provider when generating ID tokens or handling /userinfo requests.
   *
   * @param ctx - Koa/oidc-provider context object.
   * @param id - The user UUID subject identifier.
   */
  findAccount: async (ctx: KoaContextWithOIDC, id: string) => {
    // A members-only client's tokens and userinfo stop working once the membership ends
    const { route, client } = ctx.oidc;
    if ((route === "token" || route === "userinfo") && client && !(await canUseClient(id, client.clientId))) return;

    const [u] = await db.select().from(user).where(eq(user.id, id));
    if (!u) return;

    return {
      accountId: u.id,
      async claims(_use: string, scope?: string) {
        const grantedScopes = new Set(scope ? scope.split(/\s+/).filter(Boolean) : []);
        const hasScope = (s: string) => grantedScopes.has(s);

        const accountClaims: { sub: string; iss: string; [key: string]: unknown } = {
          sub: u.id,
          iss: getIssuerUrl(),
        };

        // Verified secondary emails; aalto.fi verifications expire and must be renewed
        const validSecondaryEmails =
          hasScope("profile") || hasScope("email")
            ? (await getUserSecondaryEmails(u.id)).filter((e) => isSecondaryEmailValid(e))
            : [];

        // --- Profile claims ---
        if (hasScope("profile")) {
          accountClaims.given_name = u.firstNames || undefined;
          accountClaims.family_name = u.lastName || undefined;
          accountClaims.locale = preferredLanguageToLocale(u.preferredLanguage) || "fi";
          // Not student status: staff have aalto.fi addresses too
          accountClaims.aalto_email_verified =
            u.email.toLowerCase().endsWith("@aalto.fi") || validSecondaryEmails.some((e) => e.domain === "aalto.fi");
        }

        // --- Email claims ---
        if (hasScope("email")) {
          // The primary email is verified at sign-up and whenever it changes
          accountClaims.email = u.email;
          accountClaims.email_verified = true;
          accountClaims.verified_emails = [...new Set([u.email, ...validSecondaryEmails.map((e) => e.email)])];
          accountClaims.optional_emails_allowed = u.isAllowedEmails;
        }

        // --- Membership claims ---
        if (hasScope("membership")) {
          // The membership type the user holds now, by the same rule as members-only clients
          const membershipType = await membershipTypeAt(db, u.id, new Date());
          accountClaims.active_memberships = membershipType ? [membershipType] : [];
        }

        return accountClaims;
      },
    };
  },

  // Prevent default stripping of custom claims from ID tokens
  conformIdTokenClaims: false,

  // Supported ID Token Claims registry (dynamically mapped per scope from shared/oidc)
  claims: claimsRegistry,

  // PKCE for every client, not just public ones (oidc-provider's default). RFC 9700 §2.1.1
  pkce: { required: () => true },

  // Supported response types (restricting to 'code' disables implicit flow)
  responseTypes: ["code"],

  // Server allowed formal scope identifiers from shared/oidc
  scopes: OIDC_SCOPES.map((s) => s.key),

  // Protocol endpoints. src/oidc-mount.ts forwards exactly these paths (plus discovery) to the provider.
  routes: {
    authorization: "/oidc/authorize",
    token: "/oidc/token",
    jwks: "/oidc/jwks",
    userinfo: "/oidc/userinfo",
    end_session: "/oidc/logout",
  },

  // Token & session TTLs (in seconds)
  ttl: {
    AuthorizationCode: 300, // 5 minutes
    AccessToken: 3600, // 1 hour
    IdToken: 3600, // 1 hour
    RefreshToken: 30 * 24 * 3600, // 30 days
    // Refreshing needs a live grant; rotation can extend a refresh token up to a year
    Grant: 365 * 24 * 3600,
    Interaction: 300, // 5 minutes
    Session: 30 * 24 * 3600, // 30 days
  },

  // Custom user interaction URL handler
  interactions: {
    policy: buildInteractionPolicy(),
    url(_ctx: unknown, interaction: { uid: string }) {
      return `/oidc/login/${interaction.uid}`;
    },
  },

  features: {
    userinfo: { enabled: true },
    devInteractions: { enabled: false },
    clientCredentials: { enabled: false },
    pushedAuthorizationRequests: { enabled: false },
    dPoP: { enabled: false },
  },

  // Clients are server-side apps, so browsers must not call the token, userinfo or revocation
  // endpoints cross-origin. Discovery and JWKS stay open to all origins.
  clientBasedCORS() {
    return false;
  },

  // Custom error renderer: logs error reason and error code to audit log using createAuditLog, displaying audit log record ID to end user
  renderError: async (ctx, out, error) => {
    const rawError = out.error || error?.message || "unknown_error";
    const rawDesc = out.error_description || "";
    const statusCode = (out as { status?: number }).status || 500;
    const auditContext = extractAuditContext(
      ctx,
      (out as unknown as Record<string, unknown>)?.client_id as string | undefined,
    );

    const errorCode = await createAuditLog({
      userId: auditContext.userId,
      action: "oidc_entity.error",
      targetType: "oidc_client",
      targetId: auditContext.clientId,
      metadata: {
        error: rawError,
        error_description: rawDesc,
        statusCode,
        path: auditContext.path,
        url: auditContext.url,
      },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    console.error("[OIDC renderError]", {
      code: errorCode,
      error: rawError,
      error_description: rawDesc,
      statusCode,
      path: auditContext.path,
      url: auditContext.url,
    });

    const params = new URLSearchParams({ code: errorCode });
    ctx.status = 302;
    ctx.redirect(`/oidc/error?${params.toString()}`);
  },
};

/**
 * Returns the singleton `Provider` instance, initializing it if necessary.
 * Reuses existing instance across Vite HMR reloads.
 */
export function getOidcProvider(): Provider {
  if (globalForOidc.__oidcProvider) {
    return globalForOidc.__oidcProvider;
  }

  const issuer = getIssuerUrl();
  const provider = new Provider(issuer, {
    ...configuration,
    jwks: { keys: getSigningKeys() as NonNullable<Configuration["jwks"]>["keys"] },
    cookies: { keys: getCookieKeys() },
  });
  provider.proxy = true;

  // Use scrypt client secret verification against stored hashes
  provider.Client.prototype.compareClientSecret = async function (actualSecret: string) {
    return await verifyClientSecret(actualSecret, this.clientSecret);
  };

  const handleOidcError = async (ctx: unknown, err: unknown, source: string) => {
    console.error(`[OIDC ${source}]`, err);

    const errObj = (err || {}) as Record<string, unknown>;
    const auditContext = extractAuditContext(ctx, errObj.client_id as string | undefined);
    const rawError =
      (errObj.error as string) || (errObj.name as string) || (errObj.message as string) || "invalid_client";
    const rawDesc =
      (errObj.error_description as string) || (errObj.message as string) || "Client authentication failed";
    const statusCode = (errObj.status as number) || 400;

    await createAuditLog({
      userId: auditContext.userId,
      action: "oidc_entity.error",
      targetType: "oidc_client",
      targetId: auditContext.clientId,
      metadata: {
        source,
        error: rawError,
        error_description: rawDesc,
        statusCode,
        path: auditContext.path,
        url: auditContext.url,
      },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });
  };

  // Event loggers & audit loggers for OIDC lifecycle events
  provider.on("server_error", (ctx, err) => {
    void handleOidcError(ctx, err, "Server Error");
  });
  provider.on("grant.error", (ctx, err) => {
    void handleOidcError(ctx, err, "Grant Error");
  });
  provider.on("authorization.error", (ctx, err) => {
    void handleOidcError(ctx, err, "Authorization Error");
  });

  provider.on("authorization.success", (ctx) => {
    const oidcCtx = (ctx as Record<string, unknown>).oidc as Record<string, unknown> | undefined;
    const auditContext = extractAuditContext(ctx);
    const params = oidcCtx?.params as Record<string, unknown> | undefined;

    void createAuditLog({
      userId: auditContext.userId,
      action: "oidc_entity.create",
      targetType: "oidc_client",
      targetId: auditContext.clientId,
      metadata: { type: "code", responseType: params?.response_type },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });
  });

  provider.on("grant.success", (ctx) => {
    const oidcCtx = (ctx as Record<string, unknown>).oidc as Record<string, unknown> | undefined;
    const auditContext = extractAuditContext(ctx);
    const params = oidcCtx?.params as Record<string, unknown> | undefined;

    void createAuditLog({
      userId: auditContext.userId,
      action: "oidc_entity.create",
      targetType: "oidc_client",
      targetId: auditContext.clientId,
      metadata: { type: "id_token", grantType: params?.grant_type },
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });
  });

  globalForOidc.__oidcProvider = provider;
  return provider;
}
