import type { MemberStatus } from "$lib/shared/enums";

/**
 * Valid member status transitions, aligned with Tietokilta bylaws.
 *
 * Each key is a current status, and its value is the set of statuses
 * it can transition to.
 *
 * See bylaws:
 * - §8 p1: voluntary resignation (active → resigned)
 * - §8 p2: deemed resigned for non-payment (active → resigned)
 * - §9: expulsion (active → resigned)
 * - §26: board approves new members (awaiting_approval → active)
 */
const VALID_TRANSITIONS: Record<MemberStatus, readonly MemberStatus[]> = {
  awaiting_payment: ["active", "awaiting_approval", "rejected"],
  awaiting_approval: ["active", "rejected"],
  active: ["resigned"],
  resigned: ["active"],
  rejected: ["active"],
};

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(from: MemberStatus, to: MemberStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Validate a status transition and throw a descriptive error if invalid.
 * Returns the target status for convenience.
 */
export function validateTransition(from: MemberStatus, to: MemberStatus): MemberStatus {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} → ${to}`);
  }
  return to;
}

/**
 * Get the list of valid target statuses for a given current status.
 */
export function getValidTargetStatuses(from: MemberStatus): readonly MemberStatus[] {
  return VALID_TRANSITIONS[from];
}
