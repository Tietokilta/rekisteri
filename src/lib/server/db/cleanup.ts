import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { lt } from "drizzle-orm";

/**
 * Clean up expired sessions and OTP codes from the database.
 * This prevents database bloat and ensures GDPR compliance by not
 * retaining unnecessary authentication data.
 */
export async function cleanupExpiredTokens(): Promise<void> {
	const now = new Date();

	try {
		// Delete expired email OTP codes
		const deletedOTPs = await db
			.delete(table.emailOTP)
			.where(lt(table.emailOTP.expiresAt, now))
			.returning({ id: table.emailOTP.id });

		// Delete expired sessions
		const deletedSessions = await db
			.delete(table.session)
			.where(lt(table.session.expiresAt, now))
			.returning({ id: table.session.id });

		console.log(
			`[DB Cleanup] Removed ${deletedOTPs.length} expired OTP codes and ${deletedSessions.length} expired sessions`,
		);
	} catch (error) {
		console.error("[DB Cleanup] Error during cleanup:", error);
		throw error;
	}
}
