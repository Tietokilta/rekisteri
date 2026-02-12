import { json, type RequestEvent } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Returns current user information in OpenID Connect UserInfo format.
 *
 * This endpoint provides user details for authenticated sessions, including membership status.
 * The session cookie is shared across *.tietokilta.fi subdomains (configured via COOKIE_DOMAIN).
 *
 * Usage:
 *   GET /api/auth/userinfo
 *   Cookie: auth-session=<token>
 *
 * Returns:
 *   200: OpenID-style user info with membership data
 *   401: { "error": "unauthorized" }
 *
 * Example response (success with active membership):
 *   {
 *     "sub": "user123",
 *     "email": "user@example.com",
 *     "email_verified": true,
 *     "given_name": "John",
 *     "family_name": "Doe",
 *     "home_municipality": "Helsinki",
 *     "is_admin": false,
 *     "is_allowed_emails": true,
 *     "membership": {
 *       "status": "active",
 *       "type": "Vuosijäsen 2025",
 *       "start_time": "2025-01-01T00:00:00.000Z",
 *       "end_time": "2025-12-31T23:59:59.999Z",
 *       "is_valid": true
 *     },
 *     "memberships": [...]
 *   }
 *
 * Example response (no active membership):
 *   {
 *     "sub": "user123",
 *     "email": "user@example.com",
 *     "email_verified": true,
 *     "given_name": "John",
 *     "family_name": "Doe",
 *     "home_municipality": "Helsinki",
 *     "is_admin": false,
 *     "is_allowed_emails": true,
 *     "membership": null,
 *     "memberships": []
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

  // Query all memberships for the user
  const memberRecords = await db
    .select()
    .from(table.member)
    .innerJoin(table.membership, eq(table.member.membershipId, table.membership.id))
    .innerJoin(table.membershipType, eq(table.membership.membershipTypeId, table.membershipType.id))
    .where(eq(table.member.userId, user.id))
    .orderBy(desc(table.membership.startTime));

  const now = new Date();

  // Map memberships with validity check
  const memberships = memberRecords.map((record) => {
    const isValid =
      record.member.status === "active" && now >= record.membership.startTime && now <= record.membership.endTime;

    return {
      status: record.member.status,
      type: record.membership_type.name,
      start_time: record.membership.startTime.toISOString(),
      end_time: record.membership.endTime.toISOString(),
      stripe_price_id: record.membership.stripePriceId || undefined,
      requires_student_verification: record.membership.requiresStudentVerification,
      is_valid: isValid,
    };
  });

  // Find the current active and valid membership
  const activeMembership = memberships.find((m) => m.status === "active" && m.is_valid) || null;

  // Return OpenID Connect compatible user info
  // Standard claims: sub, email, email_verified, given_name, family_name
  // Custom claims: home_municipality, is_admin, is_allowed_emails, membership, memberships
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

    // Membership claims
    membership: activeMembership, // Current active membership or null
    memberships: memberships, // All memberships (historical + current)
  });
}
