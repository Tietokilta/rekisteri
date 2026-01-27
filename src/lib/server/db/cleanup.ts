import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, inArray, isNull, lt, or } from "drizzle-orm";

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

const YEARS_IN_MS = 1000 * 60 * 60 * 24 * 365;

/**
 * Clean up inactive users from the database for GDPR compliance.
 * Users who haven't been active for the specified number of years will be deleted
 * along with all their associated data.
 *
 * A user is considered inactive if:
 * - lastActiveAt is older than the retention period, OR
 * - lastActiveAt is null AND createdAt is older than the retention period
 *
 * @param retentionYears - Number of years of inactivity before cleanup (default: 6)
 */
export async function cleanupInactiveUsers(retentionYears: number = 6): Promise<void> {
	const cutoffDate = new Date(Date.now() - retentionYears * YEARS_IN_MS);

	try {
		// Find inactive users
		const inactiveUsers = await db
			.select({ id: table.user.id, email: table.user.email })
			.from(table.user)
			.where(
				or(
					// lastActiveAt is set and older than cutoff
					and(lt(table.user.lastActiveAt, cutoffDate)),
					// lastActiveAt is null and createdAt is older than cutoff (legacy users)
					and(isNull(table.user.lastActiveAt), lt(table.user.createdAt, cutoffDate)),
				),
			);

		if (inactiveUsers.length === 0) {
			console.log("[GDPR Cleanup] No inactive users to clean up");
			return;
		}

		const userIds = inactiveUsers.map((u) => u.id);

		// Delete related records that don't have CASCADE on delete
		// (passkey and secondaryEmail have CASCADE and will be auto-deleted)
		await db.delete(table.session).where(inArray(table.session.userId, userIds));
		await db.delete(table.member).where(inArray(table.member.userId, userIds));
		await db.delete(table.auditLog).where(inArray(table.auditLog.userId, userIds));

		// Delete the users (this will cascade delete passkeys and secondary emails)
		const deletedUsers = await db
			.delete(table.user)
			.where(inArray(table.user.id, userIds))
			.returning({ id: table.user.id });

		console.log(`[GDPR Cleanup] Removed ${deletedUsers.length} users inactive for ${retentionYears}+ years`);
	} catch (error) {
		console.error("[GDPR Cleanup] Error during inactive user cleanup:", error);
		throw error;
	}
}
