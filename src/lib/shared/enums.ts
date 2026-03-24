/**
 * Shared enum values that can be safely used in both client and server code.
 * These contain only the raw enum values, not database-specific implementations.
 */

/**
 * Available admin role values.
 * - none: Regular user with no admin access
 * - readonly: Can view all admin pages but cannot make changes
 * - admin: Full admin access with read/write permissions
 */
export const ADMIN_ROLE_VALUES = ["none", "readonly", "admin"] as const;
export type AdminRole = (typeof ADMIN_ROLE_VALUES)[number];

/**
 * Check if a role has any admin access (readonly or admin).
 * Safe to use in both client and server code.
 */
export function hasAdminAccess(role: AdminRole): boolean {
  return role === "readonly" || role === "admin";
}

/**
 * Check if a role has full admin write access (admin only).
 * Safe to use in both client and server code.
 */
export function hasAdminWriteAccess(role: AdminRole): boolean {
  return role === "admin";
}

/**
 * Check if a role is read-only admin (can view but not modify).
 * Safe to use in both client and server code.
 */
export function isReadOnlyAdmin(role: AdminRole): boolean {
  return role === "readonly";
}

/**
 * Available preferred language options for users
 */
export const PREFERRED_LANGUAGE_VALUES = ["unspecified", "finnish", "english"] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGE_VALUES)[number];

/**
 * Available member status values.
 *
 * Aligned with Tietokilta bylaws (säännöt):
 * - awaiting_payment: User initiated purchase, payment not yet completed
 * - awaiting_approval: Payment received, awaiting board approval (§26)
 * - active: Board-approved active member
 * - resigned: No longer a member — voluntary resignation (§8 p1),
 *   deemed resigned for non-payment (§8 p2), or expelled (§9)
 * - rejected: Never became a member — board rejected application,
 *   or payment failed/expired
 */
export const MEMBER_STATUS_VALUES = [
  "awaiting_payment",
  "awaiting_approval",
  "active",
  "resigned",
  "rejected",
] as const;
export type MemberStatus = (typeof MEMBER_STATUS_VALUES)[number];

/**
 * Member statuses that block purchasing the same membership again.
 * Users can repurchase resigned or rejected memberships.
 */
export const BLOCKING_MEMBER_STATUSES: ReadonlySet<MemberStatus> = new Set([
  "active",
  "awaiting_approval",
  "awaiting_payment",
]);
