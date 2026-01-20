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
 * Available member status values
 */
export const MEMBER_STATUS_VALUES = [
	"awaiting_payment",
	"awaiting_approval",
	"active",
	"expired",
	"cancelled",
] as const;
export type MemberStatus = (typeof MEMBER_STATUS_VALUES)[number];

/**
 * Member statuses that block purchasing the same membership again.
 * Users can repurchase cancelled or expired memberships.
 */
export const BLOCKING_MEMBER_STATUSES: ReadonlySet<MemberStatus> = new Set([
	"active",
	"awaiting_approval",
	"awaiting_payment",
]);
