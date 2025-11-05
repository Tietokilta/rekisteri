/**
 * Shared enum values that can be safely used in both client and server code.
 * These contain only the raw enum values, not database-specific implementations.
 */

/**
 * Available preferred language options for users
 */
export const PREFERRED_LANGUAGE_VALUES = ["unspecified", "finnish", "english"] as const;

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
