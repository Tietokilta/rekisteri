import type { TranslationFunctions } from "$lib/i18n/i18n-types";

export type EmailType =
  | "otp"
  | "payment_success"
  | "membership_approved"
  | "membership_renewed"
  | "membership_rejected"
  | "membership_resigned"
  | "membership_reactivated"
  | "payment_reminder";

export interface EmailContent {
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTemplate<TMetadata = Record<string, unknown>> {
  type: EmailType;
  render(locale: "fi" | "en", metadata: TMetadata, LL: TranslationFunctions): EmailContent;
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

export interface MembershipResignedMetadata {
  firstName: string;
  membershipName: string;
  reason?: string;
}

export interface MembershipReactivatedMetadata {
  firstName: string;
  membershipName: string;
}

export interface PaymentReminderMetadata {
  firstName: string;
  membershipName: string;
  dueDate: Date;
  paymentLink: string;
}
