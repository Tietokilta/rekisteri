import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, like, lt } from "drizzle-orm";

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
 * Retention policy for audit logs
 * Different log categories have different retention requirements based on:
 * - Finnish Accounting Act (Kirjanpitolaki): 6-10 years for financial records
 * - GDPR: Data minimization for security logs
 * - Best practices: Accountability for administrative actions
 */
export interface RetentionPolicy {
	pattern: string;
	days: number;
	description: string;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
	{
		pattern: "auth.",
		days: 180, // 6 months
		description: "Security and authentication events",
	},
	{
		pattern: "member.",
		days: 2555, // ~7 years
		description: "Financial and membership events (accounting compliance)",
	},
	{
		pattern: "membership.",
		days: 2555, // ~7 years
		description: "Membership product events (accounting compliance)",
	},
	{
		pattern: "user.",
		days: 1095, // 3 years
		description: "User data changes and administrative actions",
	},
];

/**
 * Clean up old audit logs based on retention policies.
 * Different log types have different retention requirements:
 * - Security logs (auth.*): 180 days (6 months) - GDPR minimization
 * - Financial/membership logs (member.*, membership.*): 2555 days (~7 years) - Finnish Accounting Act
 * - User data changes (user.*): 1095 days (3 years) - GDPR accountability & dispute resolution
 *
 * Action prefixes determine retention period automatically.
 */
export async function cleanupOldAuditLogs(): Promise<void> {
	try {
		let totalDeleted = 0;

		for (const policy of RETENTION_POLICIES) {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - policy.days);

			const deletedLogs = await db
				.delete(table.auditLog)
				.where(and(lt(table.auditLog.createdAt, cutoffDate), like(table.auditLog.action, `${policy.pattern}%`)))
				.returning({ id: table.auditLog.id });

			totalDeleted += deletedLogs.length;

			console.log(
				`[DB Cleanup] Removed ${deletedLogs.length} ${policy.description} ` +
					`older than ${policy.days} days (${policy.pattern}*)`,
			);
		}

		console.log(`[DB Cleanup] Total audit logs removed: ${totalDeleted}`);
	} catch (error) {
		console.error("[DB Cleanup] Error during audit log cleanup:", error);
		throw error;
	}
}
