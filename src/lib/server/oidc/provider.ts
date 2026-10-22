/**
 * @file provider.ts
 * @description OIDC Identity Provider Configuration & Instance Management.
 *
 * Configures the `oidc-provider` instance for Rekisteri, including:
 * - Custom RSA signing key generation with UUID key ID (`kid`).
 * - Drizzle ORM database adapter integration.
 * - Dynamic user account lookup & claim resolution (profile, email, Aalto email verification, active memberships).
 * - Custom client secret verification.
 * - Custom error rendering and redirection to localized error pages.
 * - Hot Module Replacement (HMR) state preservation in development mode.
 */

import Provider, { interactionPolicy, type Configuration, type KoaContextWithOIDC } from "oidc-provider";
import { generateKeyPairSync, randomUUID, createHash } from "node:crypto";
import { db } from "$lib/server/db";
import { user, member, membership } from "$lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { DrizzleOidcAdapter } from "./adapter";
import { env } from "$lib/server/env";
import { preferredLanguageToLocale } from "$lib/i18n/routing";
import { OIDC_SCOPES } from "$lib/shared/oidc";
import { verifyClientSecret } from "./secret";
import { createAuditLog } from "$lib/server/audit";
import { sessionCookieName, validateSessionToken } from "$lib/server/auth/session";
import { getUserSecondaryEmails, isSecondaryEmailValid } from "$lib/server/auth/secondary-email";

/**
 * Constructs the canonical OIDC issuer URL from environment configuration.
 * e.g., "https://rekisteri.tietokilta.fi" (no path, so discovery is at /.well-known/openid-configuration)
 */
function getIssuerUrl(): string {
  return new URL(env.PUBLIC_URL).origin;
}

// Preserve signing key and Provider instance across Vite HMR reloads in development mode
const globalForOidc = globalThis as unknown as {
  __oidcJwk?: Record<string, unknown>;
  __oidcProvider?: Provider;
};

export function calculateRfc7638Thumbprint(jwk: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash("sha256").update(canonicalJson).digest("base64url");
}

export function parseBase64Jwk(input: string): Record<string, unknown> | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strictly reject if not valid base64 (e.g. raw JSON strings)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    return null;
  }

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.kty === "string") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function getOrCreateJwk(): Record<string, unknown> {
  if (globalForOidc.__oidcJwk) {
    return globalForOidc.__oidcJwk;
  }
  const envJwk = env.OIDC_SIGNING_KEY_JWK;
  if (envJwk) {
    const parsed = parseBase64Jwk(envJwk);
    if (parsed) {
      parsed.kid = calculateRfc7638Thumbprint(parsed);
      parsed.use = parsed.use ?? "sig";
      parsed.alg = parsed.alg ?? "RS256";
      globalForOidc.__oidcJwk = parsed;
      return parsed;
    } else {
      console.warn("[OIDC] Failed to parse OIDC_SIGNING_KEY_JWK from environment, falling back to ephemeral key");
    }
  }
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
  key.use = "sig";
  key.alg = "RS256";
  key.kid = randomUUID();
  globalForOidc.__oidcJwk = key;
  return key;
}

const jwk = getOrCreateJwk();

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
  findAccount: async (_ctx: unknown, id: string) => {
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
          const activeMembers = await db
            .select({ membershipTypeId: membership.membershipTypeId })
            .from(member)
            .innerJoin(membership, eq(member.membershipId, membership.id))
            .where(and(eq(member.userId, u.id), eq(member.status, "active")));

          accountClaims.active_memberships = activeMembers.map((m) => m.membershipTypeId);
        }

        return accountClaims;
      },
    };
  },

  // Prevent default stripping of custom claims from ID tokens
  conformIdTokenClaims: false,

  // Supported ID Token Claims registry (dynamically mapped per scope from shared/oidc)
  claims: claimsRegistry,

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

  cookies: {
    // The interaction cookie defaults to the interaction URL's path, but the login page is
    // served under a locale prefix (/fi/oidc/login/:uid), so widen it to the whole site.
    short: { httpOnly: true, sameSite: "lax", path: "/" },
  },

  // Token & session TTLs (in seconds)
  ttl: {
    AuthorizationCode: 300, // 5 minutes
    AccessToken: 3600, // 1 hour
    IdToken: 3600, // 1 hour
    RefreshToken: 30 * 24 * 3600, // 30 days
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

  // Dynamically issue refresh tokens if client registration enables refresh_token grant
  async issueRefreshToken(_ctx, client) {
    return Array.isArray(client.grantTypes) && client.grantTypes.includes("refresh_token");
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

    const pathParts = auditContext.path ? auditContext.path.split("/").filter(Boolean) : [];
    const maybeLocale = pathParts[0] === "en" || pathParts[0] === "fi" ? pathParts[0] : "fi";

    const params = new URLSearchParams({ code: errorCode });
    ctx.status = 302;
    ctx.redirect(`/${maybeLocale}/oidc/error?${params.toString()}`);
  },

  jwks: {
    keys: [jwk],
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
  const provider = new Provider(issuer, configuration);
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
