import { json, type RequestEvent } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session";

/**
 * Logs out the current user by invalidating their session.
 *
 * This endpoint deletes the session from the database and clears the session cookie.
 * The cookie will be cleared across all *.tietokilta.fi subdomains (configured via COOKIE_DOMAIN).
 *
 * Usage:
 *   POST /api/auth/logout
 *   Cookie: auth-session=<token>
 *
 * Returns:
 *   200: { "success": true }
 *
 * Note: This endpoint always returns success, even if no session was present.
 * After logout, the user will need to sign in again across all services.
 */
export async function POST(event: RequestEvent) {
  if (event.locals.session) {
    await auth.invalidateSession(event.locals.session.id);
    auth.deleteSessionTokenCookie(event);
  }

  return json({ success: true });
}
