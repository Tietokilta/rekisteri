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

		// Delete expired OAuth authorization codes
		const deletedAuthCodes = await db
			.delete(table.oauthAuthorizationCode)
			.where(lt(table.oauthAuthorizationCode.expiresAt, now))
			.returning({ code: table.oauthAuthorizationCode.code });

		// Delete expired OAuth tokens (access and refresh)
		const deletedOAuthTokens = await db
			.delete(table.oauthToken)
			.where(lt(table.oauthToken.expiresAt, now))
			.returning({ token: table.oauthToken.token });

		console.log(
			`[DB Cleanup] Removed ${deletedOTPs.length} expired OTP codes, ${deletedSessions.length} expired sessions, ` +
			`${deletedAuthCodes.length} expired OAuth codes, and ${deletedOAuthTokens.length} expired OAuth tokens`,
		);
	} catch (error) {
		console.error("[DB Cleanup] Error during cleanup:", error);
		throw error;
	}
}

/**
 * Clean up old audit logs from the database.
 * This ensures GDPR compliance by not retaining audit logs indefinitely.
 * Default retention period is 90 days for security and compliance balance.
 *
 * @param retentionDays - Number of days to retain audit logs (default: 90)
 */
export async function cleanupOldAuditLogs(retentionDays: number = 90): Promise<void> {
	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

	try {
		const deletedLogs = await db
			.delete(table.auditLog)
			.where(lt(table.auditLog.createdAt, cutoffDate))
			.returning({ id: table.auditLog.id });

		console.log(`[DB Cleanup] Removed ${deletedLogs.length} audit logs older than ${retentionDays} days`);
	} catch (error) {
		console.error("[DB Cleanup] Error during audit log cleanup:", error);
		throw error;
	}
}
