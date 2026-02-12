import { sendEmail } from "$lib/server/mailgun";
import { loadLocale } from "$lib/i18n/i18n-util.sync";
import { i18nObject } from "$lib/i18n/i18n-util";
import type {
  EmailType,
  EmailTemplate,
  OTPMetadata,
  PaymentSuccessMetadata,
  MembershipApprovedMetadata,
} from "./types";
import { otpTemplate } from "./templates/otp";
import { paymentSuccessTemplate } from "./templates/payment-success";
import { membershipApprovedTemplate } from "./templates/membership-approved";
import { membershipRenewedTemplate } from "./templates/membership-renewed";

// Map email types to their metadata types
interface EmailMetadataMap {
  otp: OTPMetadata;
  payment_success: PaymentSuccessMetadata;
  membership_approved: MembershipApprovedMetadata;
  membership_renewed: MembershipApprovedMetadata;
}

// Index into the map to get the metadata type for a given email type
type EmailMetadata<T extends EmailType> = EmailMetadataMap[T];

// Type-safe templates object: each email type maps to a template expecting the correct metadata
const templates: { [K in EmailType]: EmailTemplate<EmailMetadataMap[K]> } = {
  otp: otpTemplate,
  payment_success: paymentSuccessTemplate,
  membership_approved: membershipApprovedTemplate,
  membership_renewed: membershipRenewedTemplate,
};

export async function sendMemberEmail<T extends EmailType>({
  recipientEmail,
  emailType,
  metadata,
  locale = "fi",
}: {
  recipientEmail: string;
  emailType: T;
  metadata: EmailMetadata<T>;
  locale?: "fi" | "en";
  headers?: Record<string, string>;
}): Promise<void> {
  // Get template - TypeScript knows this is EmailTemplate<EmailMetadata[T]>
  const template = templates[emailType];

  // Load translations
  loadLocale(locale);
  const LL = i18nObject(locale);

  // Render content - TypeScript now knows metadata matches template's expected type
  const { subject, text, html } = template.render(locale, metadata, LL);

  // Send immediately
  await sendEmail({
    to: recipientEmail,
    subject,
    text,
  });
}
