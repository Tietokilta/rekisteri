/**
 * Secure redirect validation for authentication flows.
 *
 * Prevents open redirect attacks by validating that redirect URLs:
 * - Are same-origin only
 * - Are valid pathnames (not protocol-relative, javascript:, data:, etc.)
 *
 * Used when user attempts to access protected page → redirected to sign-in → redirected back after auth.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { env } from "$lib/server/env";

/**
 * Validates a redirect parameter from user input.
 *
 * @param redirectParam - The redirect URL from query params (untrusted user input)
 * @param origin - The application's origin (e.g., "https://rekisteri.tietokilta.fi")
 * @returns Validated relative URL (pathname + search + hash) or null if invalid
 *
 * @example
 * ```ts
 * // Valid same-origin pathnames
 * validateRedirect("/admin/members", origin) → "/admin/members"
 * validateRedirect("/meetings/shared/abc123", origin) → "/meetings/shared/abc123"
 * validateRedirect("/settings?tab=profile", origin) → "/settings?tab=profile"
 *
 * // Invalid: different origin
 * validateRedirect("https://evil.com", origin) → null
 *
 * // Invalid: protocol-relative URL (opens to different host)
 * validateRedirect("//evil.com", origin) → null
 *
 * // Invalid: dangerous protocols
 * validateRedirect("javascript:alert(1)", origin) → null
 * validateRedirect("data:text/html,<script>alert(1)</script>", origin) → null
 * ```
 */
export function validateRedirect(redirectParam: string | null, origin: string): string | null {
  if (!redirectParam) {
    return null;
  }

  try {
    // Parse URL with origin as base to handle relative URLs
    const url = new URL(redirectParam, origin);

    // Only allow same-origin redirects
    if (url.origin !== origin) {
      return null;
    }

    // Return pathname + search + hash (strips origin)
    return url.pathname + url.search + url.hash;
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Gets the default redirect path based on user status.
 *
 * @param _isAdmin - Whether the user is an admin
 * @returns Default redirect path
 */
export function getDefaultRedirect(_isAdmin: boolean): string {
  // For now, always redirect to home
  // Could be extended to redirect admins to /admin/members, etc.
  return "/";
}

// Cookie name for storing redirect parameter
export const redirectCookieName = "auth_redirect";

/**
 * Sets the redirect cookie to preserve redirect path through auth flow.
 *
 * @param event - SvelteKit request event
 * @param redirectPath - Validated redirect path (pathname + search + hash)
 */
export function setRedirectCookie(event: RequestEvent, redirectPath: string): void {
  event.cookies.set(redirectCookieName, redirectPath, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes - enough time for auth flow
  });
}

/**
 * Deletes the redirect cookie after successful auth or on error.
 *
 * @param event - SvelteKit request event
 */
export function deleteRedirectCookie(event: RequestEvent): void {
  event.cookies.delete(redirectCookieName, {
    path: "/",
  });
}

/**
 * Gets the validated redirect path from cookie or returns default.
 *
 * @param event - SvelteKit request event
 * @param origin - The application's origin for validation
 * @param isAdmin - Whether the user is an admin (for default redirect)
 * @returns Validated redirect path or default
 */
export function getRedirectPath(event: RequestEvent, origin: string, isAdmin: boolean): string {
  const redirectCookie = event.cookies.get(redirectCookieName);

  if (redirectCookie) {
    // Re-validate cookie value (defense in depth)
    const validated = validateRedirect(redirectCookie, origin);
    if (validated) {
      return validated;
    }
  }

  return getDefaultRedirect(isAdmin);
}
