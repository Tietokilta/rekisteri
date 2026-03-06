import { json, type RequestEvent } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session";

/**
 * Validates the current session cookie and returns session + user data.
 *
 * This endpoint is used by other services to validate that a user is authenticated.
 * The session cookie is shared across *.tietokilta.fi subdomains (configured via COOKIE_DOMAIN).
 *
 * Usage:
 *   GET /api/auth/session
 *   Cookie: auth-session=<token>
 *
 * Returns:
 *   200: { session: {...}, user: {...} }
 *   401: { session: null, user: null }
 *
 * Example response (success):
 *   {
 *     "session": {
 *       "id": "abc123...",
 *       "expiresAt": "2025-12-07T12:00:00.000Z"
 *     },
 *     "user": {
 *       "id": "user123",
 *       "email": "user@example.com",
 *       "firstNames": "John",
 *       "lastName": "Doe",
 *       "homeMunicipality": "Helsinki",
 *       "isAdmin": false,
 *       "isAllowedEmails": true
 *     }
 *   }
 */
export async function GET(event: RequestEvent) {
  const sessionToken = event.cookies.get(auth.sessionCookieName);

  if (!sessionToken) {
    return json({ session: null, user: null }, { status: 401 });
  }

  const { session, user } = await auth.validateSessionToken(sessionToken);

  if (!session || !user) {
    return json({ session: null, user: null }, { status: 401 });
  }

  // Return session and user data
  return json({
    session: {
      id: session.id,
      expiresAt: session.expiresAt.toISOString(),
    },
    user: {
      id: user.id,
      email: user.email,
      firstNames: user.firstNames,
      lastName: user.lastName,
      homeMunicipality: user.homeMunicipality,
      isAdmin: user.isAdmin,
      isAllowedEmails: user.isAllowedEmails,
    },
  });
}
