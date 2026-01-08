import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { lt } from "drizzle-orm";
import { logger } from "$lib/server/telemetry";

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

		logger.info("db.cleanup.tokens_completed", {
			"deleted.otps": deletedOTPs.length,
			"deleted.sessions": deletedSessions.length,
		});
	} catch (error) {
		logger.error("db.cleanup.tokens_failed", error);
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

		logger.info("db.cleanup.audit_logs_completed", {
			"deleted.logs": deletedLogs.length,
			"retention.days": retentionDays,
		});
	} catch (error) {
		logger.error("db.cleanup.audit_logs_failed", error);
		throw error;
	}
}
