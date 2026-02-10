import type { TranslationFunctions } from "$lib/i18n/i18n-types";

export type EmailType = "otp" | "payment_success" | "membership_approved" | "membership_renewed";

export interface EmailContent {
  subject: string;
  text: string;
  html?: string; // Optional for future
}

export interface EmailTemplate<TMetadata = Record<string, unknown>> {
  type: EmailType;

  // Generate email content
  render(locale: "fi" | "en", metadata: TMetadata, LL: TranslationFunctions): EmailContent;

  // For future: batching, deduplication config
  // (keep interface extensible but don't implement yet)
}

// Specific metadata types
export interface OTPMetadata {
  code: string;
}

export interface PaymentSuccessMetadata {
  membershipName: string;
  amount: number;
  currency: string;
}

export interface MembershipApprovedMetadata {
  firstName: string;
  membershipName: string;
  startDate: Date;
  endDate: Date;
}
