/**
 * Routes OIDC protocol requests to `oidc-provider` before they reach SvelteKit.
 *
 * `oidc-provider` is a Koa app that needs Node's req/res, which SvelteKit route handlers
 * don't expose. So the production server (`start-with-migrations.ts`) and the Vite dev and
 * preview servers (`vite.config.ts`) mount this middleware ahead of the SvelteKit handler.
 *
 * This file runs outside the SvelteKit bundle (plain Node with type stripping), so it can't
 * import app code. The provider instance is created inside the bundle by `getOidcProvider()`
 * and shared through `globalThis`. If the provider was never created (OIDC disabled), every
 * request falls through to SvelteKit.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => unknown;
type OidcProvider = { callback: () => NodeHandler };

// Protocol endpoints served by oidc-provider. Must match `routes` in src/lib/server/oidc/provider.ts.
const OIDC_PATHS = [
  "/.well-known/openid-configuration",
  "/oidc/auth",
  "/oidc/token",
  "/oidc/jwks",
  "/oidc/userinfo",
  "/oidc/logout",
];

export function isOidcPath(url: string | undefined): boolean {
  const { pathname } = new URL(url ?? "/", "http://localhost");
  return OIDC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

let cached: { provider: OidcProvider; callback: NodeHandler } | undefined;

function getProviderCallback(): NodeHandler | undefined {
  const provider = (globalThis as { __oidcProvider?: OidcProvider }).__oidcProvider;
  if (!provider) return undefined;
  // Re-read on change so dev HMR picks up a recreated provider
  if (cached?.provider !== provider) cached = { provider, callback: provider.callback() };
  return cached.callback;
}

export function hasOidcProvider(): boolean {
  return getProviderCallback() !== undefined;
}

export function oidcMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const callback = getProviderCallback();
  if (callback && isOidcPath(req.url)) {
    void callback(req, res);
    return;
  }
  next();
}
