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

/**
 * Meeting status values
 */
export const MEETING_STATUS_VALUES = ["upcoming", "ongoing", "recess", "finished"] as const;
export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

/**
 * Meeting event type values
 */
export const MEETING_EVENT_TYPE_VALUES = ["START", "RECESS_START", "RECESS_END", "FINISH"] as const;
export type MeetingEventType = (typeof MEETING_EVENT_TYPE_VALUES)[number];

/**
 * Attendance event type values
 */
export const ATTENDANCE_EVENT_TYPE_VALUES = ["CHECK_IN", "CHECK_OUT"] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPE_VALUES)[number];

/**
 * Scan method values
 */
export const SCAN_METHOD_VALUES = ["qr_scan", "manual"] as const;
export type ScanMethod = (typeof SCAN_METHOD_VALUES)[number];
