import type { PreferredLanguage } from "./enums";

export interface MailingList {
  address: string;
  requiresEmailConsent: boolean;
  language?: Exclude<PreferredLanguage, "unspecified">;
}

export const MAILING_LISTS = {
  jasenet: { address: "jasenet@tietokilta.fi", requiresEmailConsent: false },
  "jasenet-fi": { address: "jasenet-fi@tietokilta.fi", requiresEmailConsent: false, language: "finnish" },
  "jasenet-en": { address: "jasenet-en@tietokilta.fi", requiresEmailConsent: false, language: "english" },
  aktiivit: { address: "aktiivit@tietokilta.fi", requiresEmailConsent: true },
  "aktiivit-fi": { address: "aktiivit-fi@tietokilta.fi", requiresEmailConsent: true, language: "finnish" },
  "aktiivit-en": { address: "aktiivit-en@tietokilta.fi", requiresEmailConsent: true, language: "english" },
} as const satisfies Record<string, MailingList>;
