/**
 * @file provider.ts
 * @description OIDC Identity Provider Configuration & Instance Management.
 *
 * Configures the `oidc-provider` instance for Rekisteri, including:
 * - Custom RSA signing key generation with UUID key ID (`kid`).
 * - Drizzle ORM database adapter integration.
 * - Dynamic user account lookup & claim resolution (profile, email, verified student status, active memberships).
 * - Custom client secret verification.
 * - Custom error rendering and redirection to localized error pages.
 * - Hot Module Replacement (HMR) state preservation in development mode.
 */

import Provider, { type Configuration } from "oidc-provider";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { db } from "$lib/server/db";
import { user, member, membership, secondaryEmail, oidcClient } from "$lib/server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { DrizzleOidcAdapter } from "./adapter";
import { env } from "$lib/server/env";
import { preferredLanguageToLocale } from "$lib/i18n/routing";
import { OIDC_SCOPES } from "$lib/shared/oidc";
import { verifyClientSecret } from "./secret";
import { createAuditLog } from "$lib/server/audit";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Unique Key ID (kid) for RSA signing key.
 */
const OIDC_KEY_ID = randomUUID();

/**
 * Constructs the canonical OIDC issuer URL from environment configuration.
 * e.g., "https://rekisteri.tietokilta.fi/oidc"
 */
function getIssuerUrl(): string {
  const baseUrl = env.PUBLIC_URL.replace(/\/$/, "");
  return baseUrl.endsWith("/oidc") ? baseUrl : `${baseUrl}/oidc`;
}

// Preserve signing key and Provider instance across Vite HMR reloads in development mode
const globalForOidc = globalThis as unknown as {
  __oidcJwk?: Record<string, unknown>;
  __oidcProvider?: Provider;
};

function getOrCreateJwk(): Record<string, unknown> {
  if (globalForOidc.__oidcJwk) {
    return globalForOidc.__oidcJwk;
  }
  const envJwk = env.OIDC_SIGNING_KEY_JWK;
  if (envJwk) {
    try {
      const parsed = JSON.parse(envJwk) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && parsed.kty) {
        globalForOidc.__oidcJwk = parsed;
        return parsed;
      }
    } catch {
      console.warn("[OIDC] Failed to parse OIDC_SIGNING_KEY_JWK from environment, falling back to ephemeral key");
    }
  }
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const key = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
  key.use = "sig";
  key.alg = "RS256";
  key.kid = OIDC_KEY_ID;
  globalForOidc.__oidcJwk = key;
  return key;
}

const jwk = getOrCreateJwk();

/**
 * Helper: Extract requested scopes for a client session.
 * Fallbacks to client's registered default scopes if not explicitly supplied in interaction.
 *
 * @param ctx - Koa/oidc-provider context object.
 * @param userId - Target user UUID.
 * @returns Array of scope strings.
 */
async function getClientScopes(ctx: unknown, _userId: string): Promise<string[]> {
  const oidcContext = (
    ctx as {
      oidc?: {
        client?: { clientId?: string; scopes?: string[] };
        params?: { client_id?: string };
        entities?: { Client?: { clientId?: string; scopes?: string[] } };
      };
    }
  )?.oidc;

  const clientId =
    oidcContext?.client?.clientId || oidcContext?.entities?.Client?.clientId || oidcContext?.params?.client_id;

  if (clientId) {
    const [client] = await db
      .select({ scopes: oidcClient.scopes })
      .from(oidcClient)
      .where(eq(oidcClient.clientId, clientId));

    if (client && Array.isArray(client.scopes)) {
      return Array.from(new Set(["openid", ...client.scopes]));
    }
  }

  return ["openid"];
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

function getKoaIp(ctx: unknown): string | undefined {
  const koaCtx = ctx as
    | {
        get?: (header: string) => string | undefined;
        ip?: string;
        req?: { event?: RequestEvent; socket?: { remoteAddress?: string } };
      }
    | undefined;
  if (!koaCtx) return undefined;
  if (koaCtx.req?.event && typeof koaCtx.req.event.getClientAddress === "function") {
    try {
      return koaCtx.req.event.getClientAddress();
    } catch {
      // ignore fallback
    }
  }
  if (typeof koaCtx.get === "function") {
    const xClientIp = koaCtx.get("x-client-ip");
    if (xClientIp) return xClientIp.split(",", 1)[0]?.trim();
    const xForwardedFor = koaCtx.get("x-forwarded-for");
    if (xForwardedFor) return xForwardedFor.split(",", 1)[0]?.trim();
  }
  if (typeof koaCtx.ip === "string" && koaCtx.ip) return koaCtx.ip;
  return koaCtx.req?.socket?.remoteAddress;
}

function getKoaUserAgent(ctx: unknown): string | undefined {
  const koaCtx = ctx as { get?: (header: string) => string | undefined; req?: { event?: RequestEvent } } | undefined;
  if (koaCtx?.req?.event?.request?.headers) {
    const ua = koaCtx.req.event.request.headers.get("user-agent");
    if (ua) return ua;
  }
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
 * Master configuration object for `oidc-provider`.
 */
const configuration: Configuration = {
  // Enforce strong asymmetric token signing algorithms only (disables HS256, HS384, HS512, and none)
  enabledJWA: {
    idTokenSigningAlgValues: SIGNING_ALGS,
    clientAuthSigningAlgValues: SIGNING_ALGS,
    requestObjectSigningAlgValues: SIGNING_ALGS,
    introspectionSigningAlgValues: SIGNING_ALGS,
    authorizationSigningAlgValues: SIGNING_ALGS,
  },

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
  findAccount: async (ctx: unknown, id: string) => {
    const [u] = await db.select().from(user).where(eq(user.id, id));
    if (!u) return;

    return {
      accountId: u.id,
      async claims(_use: string, _scope: string) {
        const scopes = await getClientScopes(ctx, u.id);
        const hasScope = (scope: string) => scopes.includes(scope) || scopes.some((s) => s.split(" ").includes(scope));

        const accountClaims: { sub: string; iss: string; [key: string]: unknown } = {
          sub: u.id,
          iss: getIssuerUrl(),
        };

        // --- Profile claims ---
        if (hasScope("profile")) {
          accountClaims.given_name = u.firstNames || undefined;
          accountClaims.family_name = u.lastName || undefined;
          accountClaims.locale = preferredLanguageToLocale(u.preferredLanguage) || "fi";

          const isPrimaryAalto = u.email?.toLowerCase().endsWith("@aalto.fi");
          let isSecondaryAalto = false;
          if (!isPrimaryAalto) {
            const [secondaryAalto] = await db
              .select({ id: secondaryEmail.id })
              .from(secondaryEmail)
              .where(
                and(
                  eq(secondaryEmail.userId, u.id),
                  eq(secondaryEmail.domain, "aalto.fi"),
                  sql`${secondaryEmail.verifiedAt} IS NOT NULL`,
                ),
              )
              .limit(1);
            isSecondaryAalto = !!secondaryAalto;
          }
          accountClaims.verified_student = isPrimaryAalto || isSecondaryAalto;
        }

        // --- Email claims ---
        if (hasScope("email")) {
          accountClaims.primary_email = u.email;
          accountClaims.optional_emails_allowed = u.isAllowedEmails;

          const secVerified = await db
            .select({ email: secondaryEmail.email })
            .from(secondaryEmail)
            .where(and(eq(secondaryEmail.userId, u.id), sql`${secondaryEmail.verifiedAt} IS NOT NULL`));

          const verifiedEmailsSet = new Set<string>();
          if (u.email) verifiedEmailsSet.add(u.email);
          for (const s of secVerified) {
            if (s.email) verifiedEmailsSet.add(s.email);
          }

          accountClaims.verified_emails = Array.from(verifiedEmailsSet);
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

  // Custom route paths relative to issuer URL
  routes: {
    authorization: "/auth",
    token: "/token",
    jwks: "/jwks",
    end_session: "/logout",
  },

  // Token & session TTLs (in seconds)
  ttl: {
    AuthorizationCode: 300, // 5 minutes
    IdToken: 3600, // 1 hour
    RefreshToken: 30 * 24 * 3600, // 30 days
    Interaction: 300, // 5 minutes
    Session: 30 * 24 * 3600, // 30 days
  },

  // Custom user interaction URL handler
  interactions: {
    url(_ctx: unknown, interaction: { uid: string }) {
      return `/oidc/login/${interaction.uid}`;
    },
  },

  features: {
    userinfo: { enabled: false },
    devInteractions: { enabled: false },
    clientCredentials: { enabled: false },
  },

  // Enable CORS for registered OIDC clients
  clientBasedCORS() {
    return true;
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

function normalizeDiscoveryBodyInContext(ctx: {
  path: string;
  status: number;
  body?: unknown;
  protocol?: string;
  host?: string;
  oidc?: { route?: string };
}) {
  if (
    (!ctx.path.includes(".well-known") && ctx.oidc?.route !== "discovery") ||
    ctx.status !== 200 ||
    !ctx.body ||
    typeof ctx.body !== "object"
  ) {
    return;
  }

  const doc = ctx.body as Record<string, unknown>;
  const rawIssuer = typeof doc.issuer === "string" ? doc.issuer : "";
  let baseOrigin = "";
  if (rawIssuer) {
    try {
      baseOrigin = new URL(rawIssuer).origin;
    } catch {
      // Ignore
    }
  }
  if (!baseOrigin) {
    baseOrigin = `${ctx.protocol || "http"}://${ctx.host || "localhost"}`;
  }
  doc.issuer = `${baseOrigin}/oidc`;

  for (const [key, value] of Object.entries(doc)) {
    if (
      typeof value === "string" &&
      (key.endsWith("_endpoint") || key.endsWith("_uri") || key === "check_session_iframe")
    ) {
      try {
        const u = new URL(value, baseOrigin);
        let pathname = u.pathname;
        if (!pathname.startsWith("/oidc/") && pathname !== "/oidc") {
          pathname = `/oidc${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
        }
        const orig = new URL(baseOrigin);
        u.protocol = orig.protocol;
        u.host = orig.host;
        u.pathname = pathname;
        doc[key] = u.href;
      } catch {
        // Ignore
      }
    }
  }
}

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

  provider.use(async (ctx, next) => {
    const req = ctx.req as unknown as { event?: unknown };
    if (req?.event) {
      (ctx as Record<string, unknown>).event = req.event;
    }
    await next();
    if (
      (ctx.path === "/token" || (ctx as { oidc?: { route?: string } }).oidc?.route === "token") &&
      ctx.status === 200 &&
      ctx.body &&
      typeof ctx.body === "object"
    ) {
      const body = ctx.body as Record<string, unknown>;
      delete body.access_token;
      delete body.token_type;
    }
    normalizeDiscoveryBodyInContext(ctx);
  });

  // Use scrypt client secret verification against stored hashes
  provider.Client.prototype.compareClientSecret = async function (actualSecret: string) {
    return verifyClientSecret(actualSecret, this.clientSecret);
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
