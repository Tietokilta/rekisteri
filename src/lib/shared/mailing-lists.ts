import type { PreferredLanguage } from "./enums";

export interface MailingList {
  address: string;
  requiresEmailConsent: boolean;
  language?: Exclude<PreferredLanguage, "unspecified">;
}

export const MAILING_LISTS = {
  jasenet: { address: "jasenet@tietokilta.fi", requiresEmailConsent: false, language: "finnish" },
  aktiivit: { address: "aktiivit@tietokilta.fi", requiresEmailConsent: true, language: "finnish" },
  members: { address: "members@tietokilta.fi", requiresEmailConsent: false, language: "english" },
  actives: { address: "actives@tietokilta.fi", requiresEmailConsent: true, language: "english" },
} as const satisfies Record<string, MailingList>;
