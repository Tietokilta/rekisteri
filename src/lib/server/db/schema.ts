export * from "./base-schema";
export * from "./membership-schema";

import type { appCustomization, member, membershipFeePeriod, membershipType } from "./membership-schema";

export type AppCustomization = typeof appCustomization.$inferSelect;
export type Member = typeof member.$inferSelect;
export type MembershipFeePeriod = typeof membershipFeePeriod.$inferSelect;
export type MembershipType = typeof membershipType.$inferSelect;
