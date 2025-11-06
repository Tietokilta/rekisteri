import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { UserClaims } from "./jwt";

/**
 * Get membership information for a user
 */
async function getUserMembership(userId: string) {
	// Get the most recent active or awaiting_approval membership
	const member = await db.query.member.findFirst({
		where: eq(schema.member.userId, userId),
		orderBy: (members, { desc }) => [desc(members.createdAt)],
		with: {
			membership: true,
		},
	});

	if (!member) {
		return null;
	}

	return {
		status: member.status,
		type: member.membership.type,
		expires: member.membership.endTime.toISOString(),
	};
}

/**
 * Create user claims for JWT tokens
 * Maps user data to OpenID Connect standard claims
 */
export async function createUserClaims(userId: string): Promise<UserClaims> {
	// Fetch user from database
	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, userId),
	});

	if (!user) {
		throw new Error(`User not found: ${userId}`);
	}

	// Build name from first and last names
	const name =
		user.firstNames && user.lastName
			? `${user.firstNames} ${user.lastName}`
			: user.firstNames || user.lastName || undefined;

	// Get membership information
	const membership = await getUserMembership(userId);

	// Build claims object
	const claims: UserClaims = {
		sub: user.id,
		email: user.email,
		name,
		given_name: user.firstNames || undefined,
		family_name: user.lastName || undefined,
		home_municipality: user.homeMunicipality || undefined,
		is_admin: user.isAdmin,
	};

	// Add membership claims if available
	if (membership) {
		claims.membership_status = membership.status;
		claims.membership_type = membership.type;
		claims.membership_expires = membership.expires;
	}

	return claims;
}
