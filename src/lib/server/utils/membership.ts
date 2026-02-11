import type { Membership, MembershipType, LocalizedString } from "$lib/server/db/schema";

/**
 * Get localized membership type name
 */
export function getMembershipName(
  membership: Membership & { membershipType: MembershipType },
  locale: "fi" | "en",
): string {
  const names = membership.membershipType.name as LocalizedString;
  return names[locale] || names.fi || "Membership";
}
