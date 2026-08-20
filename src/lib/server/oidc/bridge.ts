/**
 * @file bridge.ts
 * @description OIDC HTTP & SvelteKit Bridge Layer.
 *
 * `oidc-provider` is built for Node.js web frameworks like Express/Koa that rely on Node's
 * native `IncomingMessage` and `ServerResponse` HTTP primitives. SvelteKit uses standard Web Fetch
 * API objects (`Request` and `Response`).
 *
 * This bridge layer seamlessly translates SvelteKit `RequestEvent` objects into mock Node.js
 * `IncomingMessage` streams and captures responses from `oidc-provider` (via `ServerResponse`)
 * back into SvelteKit `Response` objects or redirects.
 */

import { Readable } from "node:stream";
import { ServerResponse, type IncomingMessage } from "node:http";
import { redirect, type RequestEvent } from "@sveltejs/kit";
import type Provider from "oidc-provider";

import { db } from "$lib/server/db";
import { oidcClient } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { createAuditLog } from "$lib/server/audit";

/**
 * Parses a raw `Set-Cookie` header string emitted by `oidc-provider` and applies it
 * to SvelteKit's `event.cookies` store.
 *
 * Ensures all session and interaction cookies are stored with `path: "/"` so they remain
 * accessible across localized SvelteKit routes (e.g., `/fi/oidc/login` or `/en/oidc/login`).
 *
 * @param event - The current SvelteKit RequestEvent.
 * @param cookieStr - Raw Set-Cookie header value from oidc-provider.
 */
function setCookieOnEvent(event: RequestEvent, cookieStr: string): void {
  if (!cookieStr) return;
  const parts = cookieStr.split(";").map((p) => p.trim());
  const firstPart = parts[0];
  if (!firstPart) return;

  const eqIdx = firstPart.indexOf("=");
  if (eqIdx === -1) return;

  const name = firstPart.slice(0, eqIdx).trim();
  const value = firstPart.slice(eqIdx + 1).trim();

  let maxAge: number | undefined;
  let expires: Date | undefined;
  let sameSite: "lax" | "strict" | "none" = "lax";
  let httpOnly = false;
  let secure = false;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const [k, v] = part.split("=").map((s) => s.trim());
    if (!k) continue;
    const lowerKey = k.toLowerCase();

    if (lowerKey === "max-age" && v) {
      maxAge = Number(v);
    } else if (lowerKey === "expires" && v) {
      expires = new Date(v);
    } else if (lowerKey === "samesite" && v) {
      const lowerVal = v.toLowerCase();
      if (lowerVal === "strict" || lowerVal === "lax" || lowerVal === "none") {
        sameSite = lowerVal;
      }
    } else if (lowerKey === "httponly") {
      httpOnly = true;
    } else if (lowerKey === "secure") {
      secure = true;
    }
  }

  const isHttps = event.url.protocol === "https:";
  const finalSecure = isHttps ? secure : false;

  // Always enforce path="/" so cookies are sent on localized routes (e.g. /fi/oidc/login) as well as /oidc/ endpoints
  event.cookies.set(name, value, {
    path: "/",
    httpOnly,
    secure: finalSecure,
    sameSite,
    maxAge: maxAge !== undefined && !Number.isNaN(maxAge) ? maxAge : undefined,
    expires: expires && !Number.isNaN(expires.getTime()) ? expires : undefined,
  });
}

/**
 * Reconstructs the complete `Cookie` header string for the incoming mock Node.js request.
 *
 * Combines cookies from SvelteKit's `event.cookies`, raw incoming HTTP request headers,
 * and attaches interaction session cookies (`_interaction`, `_interaction_resume`) when available.
 *
 * @param event - The current SvelteKit RequestEvent.
 * @param rawHeaderCookie - Optional raw Cookie header string from the incoming HTTP request.
 * @param uid - Optional OIDC interaction UID parameter.
 * @returns Formatted cookie header string (e.g. `_session=abc; _interaction=123`).
 */
function buildCookieHeader(event: RequestEvent, rawHeaderCookie?: string, uid?: string | null): string {
  const allCookies = event.cookies && typeof event.cookies.getAll === "function" ? event.cookies.getAll() : [];
  const cookieMap = new Map<string, string>();
  for (const c of allCookies) {
    cookieMap.set(c.name, c.value);
  }
  if (rawHeaderCookie) {
    for (const p of rawHeaderCookie.split(";")) {
      const trimmed = p.trim();
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim();
        if (k && !cookieMap.has(k)) cookieMap.set(k, v);
      }
    }
  }
  if (uid) {
    if (!cookieMap.has("_interaction")) cookieMap.set("_interaction", uid);
    if (!cookieMap.has("_interaction_resume")) cookieMap.set("_interaction_resume", uid);
  }
  return Array.from(cookieMap, ([k, v]) => `${k}=${v}`).join("; ");
}

/** Known internal OIDC route endpoints */
const INTERNAL_OIDC_PATHS = ["/auth", "/login", "/token", "/jwks", "/logout", "/.well-known"];

/**
 * Rewrites internal OIDC redirect locations to align with SvelteKit route structures.
 *
 * Specifically:
 * - Redirects to user UI routes (`/login/`, `/error`) are prefixed with the active locale (e.g., `/fi/oidc/login/[uid]`).
 * - Protocol endpoints (e.g., `/token`, `/jwks`) are normalized to `/oidc/`.
 *
 * @param location - The target redirect URL emitted by oidc-provider.
 * @param targetLocale - Active locale code (e.g., "fi" or "en").
 * @returns The rewritten location path or URL string.
 */
function rewriteOidcLocation(location: string, targetLocale?: string): string {
  if (!location) return location;
  try {
    const dummyBase = "http://oidc-internal-dummy";
    const isAbsolute = location.startsWith("http://") || location.startsWith("https://");
    const parsed = new URL(location, dummyBase);

    let pathname = parsed.pathname;

    // Handle locale prefixes: login/error pages get /[locale]/oidc/, protocol endpoints get /oidc/
    if (/^\/(fi|en)\/oidc\//.test(pathname)) {
      if (pathname.includes("/oidc/login/") || pathname.includes("/oidc/error")) {
        if (targetLocale) {
          pathname = pathname.replace(/^\/(fi|en)\/oidc\//, `/${targetLocale}/oidc/`);
        }
      } else {
        pathname = pathname.replace(/^\/(fi|en)\/oidc\//, "/oidc/");
      }
      parsed.pathname = pathname;
    } else {
      const isInternalPath = INTERNAL_OIDC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

      if (isInternalPath && !pathname.startsWith("/oidc/") && pathname !== "/oidc") {
        const isUserInteractionRoute = pathname.startsWith("/login/") || pathname.startsWith("/error");
        pathname = isUserInteractionRoute && targetLocale ? `/${targetLocale}/oidc${pathname}` : `/oidc${pathname}`;
        parsed.pathname = pathname;
      }
    }

    if (isAbsolute) {
      return parsed.href;
    }
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return location;
  }
}

interface MockResponseResult {
  statusCode: number;
  headers: Headers;
  body: Buffer;
  redirectUrl?: string;
}

/**
 * Creates a mock Node.js ServerResponse that captures status, headers, cookies, and body buffers.
 */
function createMockNodeResponse(
  event: RequestEvent,
  nodeReq: IncomingMessage,
  onComplete: (result: MockResponseResult) => void,
): ServerResponse {
  const resHeaders = new Headers();
  let redirectUrl: string | undefined;
  const chunks: Buffer[] = [];
  const nodeRes = new ServerResponse(nodeReq);

  const applyHeader = (name: string, value: unknown) => {
    if (value === undefined) return;
    const lower = name.toLowerCase();
    if (lower === "set-cookie") {
      const list = Array.isArray(value) ? value : [value];
      for (const item of list) {
        if (typeof item === "string") setCookieOnEvent(event, item);
      }
    } else if (lower === "location") {
      const loc = String(Array.isArray(value) ? value[0] : value);
      redirectUrl = loc;
      resHeaders.set("location", rewriteOidcLocation(loc));
    } else {
      if (Array.isArray(value)) {
        resHeaders.delete(name);
        for (const item of value) {
          resHeaders.append(name, String(item));
        }
      } else {
        resHeaders.set(name, String(value));
      }
    }
  };

  nodeRes.writeHead = (code: number, arg1?: unknown, arg2?: unknown) => {
    nodeRes.statusCode = code;
    const headers = (typeof arg1 === "object" ? arg1 : arg2) as Record<string, unknown> | undefined;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        applyHeader(k, v);
      }
    }
    return nodeRes;
  };

  nodeRes.setHeader = (name: string, value: string | string[]) => {
    applyHeader(name, value);
    return nodeRes;
  };

  nodeRes.write = (chunk: unknown) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string));
    return true;
  };

  nodeRes.end = (chunk?: unknown, _encoding?: unknown, cb?: () => void) => {
    if (typeof chunk === "function") {
      cb = chunk as () => void;
      chunk = undefined;
    }
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string));

    const rawHeaders = nodeRes.getHeaders();
    for (const [k, v] of Object.entries(rawHeaders)) {
      applyHeader(k, v);
    }

    const body = Buffer.concat(chunks);
    onComplete({
      statusCode: nodeRes.statusCode || 200,
      headers: resHeaders,
      body,
      redirectUrl,
    });
    if (typeof cb === "function") cb();
    return nodeRes;
  };

  return nodeRes;
}

/**
 * Checks whether an incoming client IP or origin matches the client's allowed origins list.
 * If allowedOrigins is empty or not configured, all addresses are permitted.
 */
function isClientAddressAllowed(
  allowedOrigins: string[] | null | undefined,
  clientIp?: string,
  requestOrigin?: string,
): boolean {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    return true;
  }
  return allowedOrigins.some((addr) => {
    const trimmed = addr.trim();
    if (!trimmed) return false;
    if (trimmed === "*" || trimmed === "0.0.0.0" || trimmed === "::") return true;
    if (clientIp && trimmed === clientIp) return true;
    if (requestOrigin) {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        try {
          if (new URL(trimmed).origin === requestOrigin) return true;
        } catch {
          // ignore
        }
      } else {
        if (`http://${trimmed}` === requestOrigin || `https://${trimmed}` === requestOrigin) return true;
      }
    }
    return false;
  });
}

function extractRequestOrigin(req: Request): string | undefined {
  const originHeader = req.headers.get("origin") || req.headers.get("referer");
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // ignore
    }
  }
  return undefined;
}

async function validateClientAddress(
  event: RequestEvent,
  allowedOrigins: string[] | null | undefined,
  clientId: string,
  path: string,
): Promise<string | null> {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    return null;
  }
  const clientIp = typeof event.getClientAddress === "function" ? event.getClientAddress() : undefined;
  const requestOrigin = extractRequestOrigin(event.request);
  if (isClientAddressAllowed(allowedOrigins, clientIp, requestOrigin)) {
    return null;
  }
  const errorCode = await createAuditLog({
    action: "oidc_entity.error",
    targetType: "oidc_client",
    targetId: clientId,
    metadata: {
      error: "disallowed_client_address",
      error_description: "Client address or origin is not permitted",
      clientIp,
      requestOrigin,
      allowedOrigins,
      path,
    },
    ipAddress: clientIp,
    userAgent: event.request.headers.get("user-agent") || undefined,
  });

  console.error("[OIDC Client Address Error]", {
    code: errorCode,
    error: "disallowed_client_address",
    clientId,
    clientIp,
    requestOrigin,
    allowedOrigins,
  });

  return errorCode;
}

async function preprocessAuthRequest(
  event: RequestEvent,
  path: string,
  searchParams: URLSearchParams,
): Promise<Response | null> {
  if (searchParams.has("client_id")) {
    const clientId = searchParams.get("client_id");
    if (clientId) {
      const [client] = await db
        .select({ scopes: oidcClient.scopes, type: oidcClient.type, allowedOrigins: oidcClient.allowedOrigins })
        .from(oidcClient)
        .where(eq(oidcClient.clientId, clientId));

      if (client && client.type !== "authorization_code") {
        return new Response("Unauthorized client: /auth endpoint is not available for client_credentials clients", {
          status: 400,
        });
      }

      if (client) {
        const errorCode = await validateClientAddress(event, client.allowedOrigins, clientId, path);
        if (errorCode) {
          const currentLocale = event.params?.locale || event.locals?.locale || "fi";
          const targetLocale = currentLocale === "en" || currentLocale === "fi" ? currentLocale : "fi";
          const params = new URLSearchParams({ code: errorCode });
          redirect(302, `/${targetLocale}/oidc/error?${params.toString()}`);
        }

        const configuredScopes = Array.isArray(client.scopes) ? client.scopes : [];
        const allClientScopes = Array.from(new Set(["openid", ...configuredScopes])).join(" ");
        searchParams.set("scope", allClientScopes);
      }
    }
  }
  if (!searchParams.get("scope")) {
    searchParams.set("scope", "openid");
  }
  if (!searchParams.get("response_type")) {
    searchParams.set("response_type", "code");
  }
  return null;
}

function extractBasicAuthClientId(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.toLowerCase().startsWith("basic ")) return null;
  try {
    const credentials = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
    const colonIdx = credentials.indexOf(":");
    return colonIdx === -1 ? null : credentials.slice(0, colonIdx);
  } catch {
    return null;
  }
}

function resolveGrantType(
  hasRefreshToken: boolean,
  hasCode: boolean,
  explicitGrantType?: string | null,
): string | null {
  if (hasRefreshToken) return "refresh_token";
  if (hasCode || explicitGrantType === "authorization_code") return "authorization_code";
  return null;
}

async function preprocessTokenRequest(
  event: RequestEvent,
  path: string,
  searchParams: URLSearchParams,
  bodyBuffer: Buffer,
): Promise<{ errorResponse?: Response; modifiedBody: Buffer }> {
  const contentType = event.request.headers.get("content-type") || "";
  let tokenClientId =
    searchParams.get("client_id") || extractBasicAuthClientId(event.request.headers.get("authorization"));
  let modifiedBody = bodyBuffer;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const bodyParams = new URLSearchParams(bodyBuffer.toString("utf8"));
    if (!tokenClientId && bodyParams.get("client_id")) {
      tokenClientId = bodyParams.get("client_id");
    }
    const hasRefreshToken = Boolean(bodyParams.get("refresh_token") || searchParams.get("refresh_token"));
    const hasCode = Boolean(
      bodyParams.get("code_verifier") ||
      bodyParams.get("code") ||
      searchParams.get("code_verifier") ||
      searchParams.get("code"),
    );
    const targetGrantType = resolveGrantType(hasRefreshToken, hasCode, bodyParams.get("grant_type"));
    if (targetGrantType) {
      bodyParams.set("grant_type", targetGrantType);
      modifiedBody = Buffer.from(bodyParams.toString());
    }
  } else if (contentType.includes("application/json")) {
    try {
      const jsonBody = (JSON.parse(bodyBuffer.toString("utf8")) || {}) as Record<string, unknown>;
      if (!tokenClientId && typeof jsonBody.client_id === "string") {
        tokenClientId = jsonBody.client_id;
      }
      const hasRefreshToken = Boolean(jsonBody.refresh_token || searchParams.get("refresh_token"));
      const hasCode = Boolean(
        jsonBody.code_verifier || jsonBody.code || searchParams.get("code_verifier") || searchParams.get("code"),
      );
      const targetGrantType = resolveGrantType(
        hasRefreshToken,
        hasCode,
        typeof jsonBody.grant_type === "string" ? jsonBody.grant_type : null,
      );
      if (targetGrantType) {
        jsonBody.grant_type = targetGrantType;
        modifiedBody = Buffer.from(JSON.stringify(jsonBody));
      }
    } catch {
      // ignore invalid json
    }
  }

  if (tokenClientId) {
    const [tokenClient] = await db
      .select({ allowedOrigins: oidcClient.allowedOrigins })
      .from(oidcClient)
      .where(eq(oidcClient.clientId, tokenClientId));

    if (tokenClient) {
      const errorCode = await validateClientAddress(event, tokenClient.allowedOrigins, tokenClientId, path);
      if (errorCode) {
        return {
          errorResponse: Response.json(
            {
              error: "unauthorized_client",
              error_description: "Client address or origin is not permitted",
            },
            {
              status: 403,
              headers: { "content-type": "application/json" },
            },
          ),
          modifiedBody,
        };
      }
    }
  }

  return { modifiedBody };
}

function sanitizeTokenResponseBody(body: Buffer): Buffer {
  try {
    const parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      delete parsed.access_token;
      delete parsed.token_type;
      return Buffer.from(JSON.stringify(parsed));
    }
  } catch {
    // Ignore JSON parse errors
  }
  return body;
}

function normalizeDiscoveryResponseBody(body: Buffer, requestUrl?: URL): Buffer {
  try {
    const doc = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    if (!doc || typeof doc !== "object") {
      return body;
    }
    const rawIssuer = typeof doc.issuer === "string" ? doc.issuer : "";
    let baseOrigin = "";
    if (rawIssuer) {
      try {
        baseOrigin = new URL(rawIssuer).origin;
      } catch {
        // Ignore URL parse error
      }
    }
    if (!baseOrigin && requestUrl) {
      baseOrigin = requestUrl.origin;
    }

    if (baseOrigin) {
      doc.issuer = `${baseOrigin}/oidc`;
    }

    for (const [key, value] of Object.entries(doc)) {
      if (
        typeof value === "string" &&
        (key.endsWith("_endpoint") || key.endsWith("_uri") || key === "check_session_iframe")
      ) {
        try {
          const u = new URL(value, baseOrigin || "http://localhost");
          let pathname = u.pathname;
          if (!pathname.startsWith("/oidc/") && pathname !== "/oidc") {
            pathname = `/oidc${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
          }
          if (baseOrigin) {
            const originUrl = new URL(baseOrigin);
            u.protocol = originUrl.protocol;
            u.host = originUrl.host;
          }
          u.pathname = pathname;
          doc[key] = u.href;
        } catch {
          // Ignore URL parse errors
        }
      }
    }
    return Buffer.from(JSON.stringify(doc));
  } catch {
    return body;
  }
}

function postprocessOidcResponse(
  path: string,
  statusCode: number,
  headers: Headers,
  body: Buffer,
  requestUrl?: URL,
): { modifiedBody: Buffer } {
  if (statusCode === 200 && headers.get("content-type")?.includes("application/json")) {
    if (path === "/token" || path.endsWith("/token")) {
      const modifiedBody = sanitizeTokenResponseBody(body);
      headers.set("content-length", String(modifiedBody.length));
      return { modifiedBody };
    }
    if (path.includes("/well-known/")) {
      const modifiedBody = normalizeDiscoveryResponseBody(body, requestUrl);
      headers.set("content-length", String(modifiedBody.length));
      return { modifiedBody };
    }
  }
  return { modifiedBody: body };
}

/**
 * Handles incoming OIDC protocol HTTP requests in SvelteKit routes.
 *
 * Performs request preprocessing (parameter defaults, body parsing, grant type determination),
 * creates a mock Node.js `IncomingMessage` stream, dispatches it to `oidc-provider`,
 * intercepts the Node.js `ServerResponse`, and converts it into a standard Web Fetch `Response`.
 *
 * @param event - The SvelteKit RequestEvent.
 * @param provider - The initialized oidc-provider instance.
 * @returns A Promise resolving to a Fetch API Response object.
 */
export async function handleOidcRequest(event: RequestEvent, provider: Provider): Promise<Response> {
  const req = event.request;
  const url = new URL(req.url);

  const arrayBuffer = await req.arrayBuffer();
  let bodyBuffer: Buffer = Buffer.from(arrayBuffer);

  let path = url.pathname;
  if (path.startsWith("/oidc/")) {
    path = path.slice(5);
  } else if (path === "/oidc") {
    path = "/";
  }

  // 1. /auth request: Always assumed to be authorization_code flow
  const searchParams = new URLSearchParams(url.search);
  if (path === "/auth" || path === "/oidc/auth" || path.endsWith("/auth")) {
    const authErrorResponse = await preprocessAuthRequest(event, path, searchParams);
    if (authErrorResponse) {
      return authErrorResponse;
    }
    url.search = searchParams.toString();
  }

  // 2. /token request: Decide grant_type dynamically & check allowedOrigins
  if ((path === "/token" || path === "/oidc/token" || path.endsWith("/token")) && req.method === "POST") {
    const tokenResult = await preprocessTokenRequest(event, path, searchParams, bodyBuffer);
    if (tokenResult.errorResponse) {
      return tokenResult.errorResponse;
    }
    bodyBuffer = tokenResult.modifiedBody;
  }

  const searchString = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const stream = Readable.from(bodyBuffer);

  const reqHeaders = Object.fromEntries(req.headers.entries());
  reqHeaders["content-length"] = String(bodyBuffer.length);
  if (!reqHeaders.host) {
    reqHeaders.host = url.host;
  }

  const pathParts = path.split("/").filter(Boolean);
  const possibleUid =
    searchParams.get("uid") ||
    pathParts.find((p) => p !== "auth" && p !== "resume" && p !== "login" && p !== "oidc") ||
    null;

  reqHeaders.cookie = buildCookieHeader(event, reqHeaders.cookie, possibleUid);

  const clientIp = typeof event.getClientAddress === "function" ? event.getClientAddress() : undefined;
  if (clientIp && !reqHeaders["x-forwarded-for"] && !reqHeaders["x-client-ip"]) {
    reqHeaders["x-forwarded-for"] = clientIp;
  }

  const nodeReq = Object.assign(stream, {
    headers: reqHeaders,
    method: req.method,
    url: path + searchString,
    httpVersion: "1.1",
    socket: { encrypted: url.protocol === "https:", remoteAddress: clientIp },
    event,
  }) as unknown as IncomingMessage;

  return new Promise((resolve) => {
    const nodeRes = createMockNodeResponse(event, nodeReq, ({ statusCode, headers, body }) => {
      const { modifiedBody } = postprocessOidcResponse(path, statusCode, headers, body, url);
      resolve(new Response(new Uint8Array(modifiedBody), { status: statusCode, headers }));
    });
    provider.callback()(nodeReq, nodeRes);
  });
}

/**
 * Completes an OIDC interaction step (login authentication or consent approval)
 * in SvelteKit server action routes.
 *
 * Passes the interaction result (e.g. `{ login: { accountId }, consent: { grantId } }`)
 * to `oidc-provider` via `provider.interactionFinished()`, captures the resulting redirect location,
 * rewrites it for the active locale, and issues a SvelteKit `redirect(303, location)`.
 *
 * @param event - The SvelteKit RequestEvent.
 * @param provider - The initialized oidc-provider instance.
 * @param result - Interaction result object.
 */
export async function finishInteraction(
  event: RequestEvent,
  provider: Provider,
  result: Record<string, unknown>,
): Promise<never> {
  const req = event.request;
  const url = new URL(req.url);

  const uid = event.params.uid;
  const reqHeaders = Object.fromEntries(req.headers.entries());

  reqHeaders.cookie = buildCookieHeader(event, reqHeaders.cookie, uid);

  if (!reqHeaders.host) {
    reqHeaders.host = url.host;
  }
  reqHeaders["content-length"] = "0";

  // Safe stream for request - SvelteKit form action already consumed event.request body
  const stream = Readable.from(Buffer.alloc(0));

  const nodeReq = Object.assign(stream, {
    headers: reqHeaders,
    method: "POST",
    url: `/auth/${uid}`,
    httpVersion: "1.1",
    socket: { encrypted: url.protocol === "https:" },
  }) as unknown as IncomingMessage;

  const targetLocation = await new Promise<string>((resolve, reject) => {
    const nodeRes = createMockNodeResponse(event, nodeReq, ({ redirectUrl }) => {
      resolve(redirectUrl || `/auth/${uid}`);
    });

    void provider
      .interactionFinished(nodeReq, nodeRes, result, { mergeWithLastSubmission: true })
      .catch((err: unknown) => {
        console.error("[OIDC finishInteraction Error]", err);
        reject(err);
      });
  });

  const currentLocale = event.params?.locale || event.locals?.locale;
  const rewrittenLocation = rewriteOidcLocation(targetLocation, currentLocale);
  redirect(303, rewrittenLocation);
}
