import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { and, inArray, isNull, like, lt, or } from "drizzle-orm";
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

      logger.info("db.cleanup.audit_logs_policy_completed", {
        "deleted.logs": deletedLogs.length,
        "policy.pattern": policy.pattern,
        "policy.days": policy.days,
        "policy.description": policy.description,
      });
    }

    logger.info("db.cleanup.audit_logs_completed", {
      "deleted.logs.total": totalDeleted,
    });
  } catch (error) {
    logger.error("db.cleanup.audit_logs_failed", error);
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
 * Retention period set to 7 years to match the longest audit log retention
 * requirement (financial/membership events per Finnish Accounting Act).
 *
 * @param retentionYears - Number of years of inactivity before cleanup (default: 7)
 */
export async function cleanupInactiveUsers(retentionYears: number = 7): Promise<void> {
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
      logger.info("db.cleanup.inactive_users_none", {
        "retention.years": retentionYears,
      });
      return;
    }

    const userIds = inactiveUsers.map((u) => u.id);

    // Use transaction to ensure all deletions succeed or none do
    await db.transaction(async (tx) => {
      // Delete related records that don't have CASCADE on delete
      // (passkey and secondaryEmail have CASCADE and will be auto-deleted)
      await tx.delete(table.session).where(inArray(table.session.userId, userIds));
      await tx.delete(table.member).where(inArray(table.member.userId, userIds));
      await tx.delete(table.auditLog).where(inArray(table.auditLog.userId, userIds));

      // Delete the users (this will cascade delete passkeys and secondary emails)
      await tx.delete(table.user).where(inArray(table.user.id, userIds));
    });

    logger.info("db.cleanup.inactive_users_completed", {
      "deleted.users": userIds.length,
      "retention.years": retentionYears,
    });
  } catch (error) {
    logger.error("db.cleanup.inactive_users_failed", error);
    throw error;
  }
}
