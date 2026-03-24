import { sendEmail } from "$lib/server/mailgun";
import { loadLocale } from "$lib/i18n/i18n-util.sync";
import { i18nObject } from "$lib/i18n/i18n-util";
import { db as defaultDb } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type {
  EmailType,
  EmailTemplate,
  OTPMetadata,
  PaymentSuccessMetadata,
  MembershipApprovedMetadata,
  MembershipResignedMetadata,
  MembershipReactivatedMetadata,
  PaymentReminderMetadata,
} from "./types";
import { otpTemplate } from "./templates/otp";
import { paymentSuccessTemplate } from "./templates/payment-success";
import { membershipApprovedTemplate } from "./templates/membership-approved";
import { membershipRenewedTemplate } from "./templates/membership-renewed";
import { membershipRejectedTemplate } from "./templates/membership-rejected";
import { membershipResignedTemplate } from "./templates/membership-resigned";
import { membershipReactivatedTemplate } from "./templates/membership-reactivated";
import { paymentReminderTemplate } from "./templates/payment-reminder";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Map email types to their metadata types
interface EmailMetadataMap {
  otp: OTPMetadata;
  payment_success: PaymentSuccessMetadata;
  membership_approved: MembershipApprovedMetadata;
  membership_renewed: MembershipApprovedMetadata;
  membership_rejected: MembershipApprovedMetadata;
  membership_resigned: MembershipResignedMetadata;
  membership_reactivated: MembershipReactivatedMetadata;
  payment_reminder: PaymentReminderMetadata;
}

// Index into the map to get the metadata type for a given email type
type EmailMetadata<T extends EmailType> = EmailMetadataMap[T];

// Type-safe templates object: each email type maps to a template expecting the correct metadata
const templates: { [K in EmailType]: EmailTemplate<EmailMetadataMap[K]> } = {
  otp: otpTemplate,
  payment_success: paymentSuccessTemplate,
  membership_approved: membershipApprovedTemplate,
  membership_renewed: membershipRenewedTemplate,
  membership_rejected: membershipRejectedTemplate,
  membership_resigned: membershipResignedTemplate,
  membership_reactivated: membershipReactivatedTemplate,
  payment_reminder: paymentReminderTemplate,
};

export async function sendMemberEmail<T extends EmailType>({
  recipientEmail,
  emailType,
  metadata,
  locale = "fi",
  headers,
  userId,
  relatedMemberId,
  db,
}: {
  recipientEmail: string;
  emailType: T;
  metadata: EmailMetadata<T>;
  locale?: "fi" | "en";
  headers?: Record<string, string>;
  /** If provided, the send is logged to email_log for dedup and tracking */
  userId?: string;
  relatedMemberId?: string;
  db?: PostgresJsDatabase<typeof table>;
}): Promise<void> {
  const template = templates[emailType];

  loadLocale(locale);
  const LL = i18nObject(locale);

  const { subject, text, html } = template.render(locale, metadata, LL);

  const dbInstance = db ?? defaultDb;
  let mailgunMessageId: string | undefined;
  let status: "sent" | "failed" = "sent";

  try {
    const result = await sendEmail({
      to: recipientEmail,
      subject,
      text,
      html,
      headers,
    });
    mailgunMessageId = result.id;
  } catch (error) {
    status = "failed";
    throw error;
  } finally {
    // Log to email_log if userId is provided (skip for anonymous emails like OTP)
    if (userId) {
      try {
        await dbInstance.insert(table.emailLog).values({
          id: crypto.randomUUID(),
          userId,
          emailType,
          relatedMemberId,
          status,
          mailgunMessageId,
          sentAt: status === "sent" ? new Date() : null,
        });
      } catch (logError) {
        console.error("[Email] Failed to log email send:", logError);
      }
    }
  }
}
