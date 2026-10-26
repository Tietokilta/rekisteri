import type { Cookies } from "@sveltejs/kit";

/**
 * Where to send the user after signing in, when they started from an app's OIDC login page.
 *
 * The cookie is set only from that page and lives as long as the login does (oidc-provider's
 * interaction TTL). It's still untrusted on read (another *.tietokilta.fi site could plant one), so
 * only an /oidc/login/{uid} path is ever returned.
 */
const COOKIE_NAME = "returnTo";
const OIDC_LOGIN_PATH = /^\/oidc\/login\/[\w-]+$/;

/** Remembers the OIDC login page the sign-in started from, or forgets any earlier one. */
export function rememberReturnTo(cookies: Cookies, referer: string | null, origin: string) {
  let path: string | undefined;
  try {
    const url = new URL(referer ?? "");
    if (url.origin === origin && OIDC_LOGIN_PATH.test(url.pathname)) path = url.pathname;
  } catch {
    // No or invalid referer: not coming from a login page
  }
  if (path) cookies.set(COOKIE_NAME, path, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 5 });
  else cookies.delete(COOKIE_NAME, { path: "/" });
}

/** Returns the remembered OIDC login page (if valid) and clears it. */
export function takeReturnTo(cookies: Cookies): string | undefined {
  const value = cookies.get(COOKIE_NAME);
  if (value === undefined) return undefined;
  cookies.delete(COOKIE_NAME, { path: "/" });
  return OIDC_LOGIN_PATH.test(value) ? value : undefined;
}
