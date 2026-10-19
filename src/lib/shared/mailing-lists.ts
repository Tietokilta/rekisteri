export interface MailingList {
  address: string;
  requiresEmailConsent: boolean;
}

export const MAILING_LISTS = {
  jasenet: { address: "jasenet@tietokilta.fi", requiresEmailConsent: false },
  aktiivit: { address: "aktiivit@tietokilta.fi", requiresEmailConsent: true },
} as const satisfies Record<string, MailingList>;
