import { json, type RequestEvent } from "@sveltejs/kit";

/**
 * Returns current user information in OpenID Connect UserInfo format.
 *
 * This endpoint provides user details for authenticated sessions.
 * The session cookie is shared across *.tietokilta.fi subdomains (configured via COOKIE_DOMAIN).
 *
 * Usage:
 *   GET /api/auth/userinfo
 *   Cookie: auth-session=<token>
 *
 * Returns:
 *   200: OpenID-style user info
 *   401: { "error": "unauthorized" }
 *
 * Example response (success):
 *   {
 *     "sub": "user123",
 *     "email": "user@example.com",
 *     "email_verified": true,
 *     "given_name": "John",
 *     "family_name": "Doe",
 *     "home_municipality": "Helsinki",
 *     "is_admin": false,
 *     "is_allowed_emails": true
 *   }
 *
 * Standard Claims Reference:
 *   https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
 */
export async function GET(event: RequestEvent) {
	if (!event.locals.user || !event.locals.session) {
		return json({ error: "unauthorized" }, { status: 401 });
	}

	const user = event.locals.user;

	// Return OpenID Connect compatible user info
	// Standard claims: sub, email, email_verified, given_name, family_name
	// Custom claims: home_municipality, is_admin, is_allowed_emails
	return json({
		sub: user.id, // Subject (user ID)
		email: user.email,
		email_verified: true, // We verify via OTP
		given_name: user.firstNames || undefined,
		family_name: user.lastName || undefined,

		// Custom claims (non-standard)
		home_municipality: user.homeMunicipality || undefined,
		is_admin: user.isAdmin,
		is_allowed_emails: user.isAllowedEmails,
	});
}
