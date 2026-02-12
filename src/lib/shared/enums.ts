/**
 * Shared enum values that can be safely used in both client and server code.
 * These contain only the raw enum values, not database-specific implementations.
 */

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
