import { sendEmail } from "$lib/server/mailgun";
import { loadLocale } from "$lib/i18n/i18n-util.sync";
import { i18nObject } from "$lib/i18n/i18n-util";
import type { EmailType, OTPMetadata, PaymentSuccessMetadata, MembershipApprovedMetadata } from "./types";
import { otpTemplate } from "./templates/otp";
import { paymentSuccessTemplate } from "./templates/payment-success";
import { membershipApprovedTemplate } from "./templates/membership-approved";
import { membershipRenewedTemplate } from "./templates/membership-renewed";

const templates = {
  otp: otpTemplate,
  payment_success: paymentSuccessTemplate,
  membership_approved: membershipApprovedTemplate,
  membership_renewed: membershipRenewedTemplate,
} as const;

type EmailMetadata<T extends EmailType> = T extends "otp"
  ? OTPMetadata
  : T extends "payment_success"
    ? PaymentSuccessMetadata
    : T extends "membership_approved"
      ? MembershipApprovedMetadata
      : T extends "membership_renewed"
        ? MembershipApprovedMetadata
        : never;

export async function sendMemberEmail<T extends EmailType>({
  recipientEmail,
  emailType,
  metadata,
  locale = "fi",
  headers,
}: {
  recipientEmail: string;
  emailType: T;
  metadata: EmailMetadata<T>;
  locale?: "fi" | "en";
  headers?: Record<string, string>;
}): Promise<void> {
  // Get template
  const template = templates[emailType];

  // Load translations
  loadLocale(locale);
  const LL = i18nObject(locale);

  // Render content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { subject, text, html } = template.render(locale, metadata as any, LL);

  // Send immediately
  await sendEmail({
    to: recipientEmail,
    subject,
    text,
    html,
    headers,
  });
}

// Re-export types for convenience
export type { EmailType, OTPMetadata, PaymentSuccessMetadata, MembershipApprovedMetadata } from "./types";
