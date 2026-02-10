import type { EmailTemplate, MembershipApprovedMetadata } from "../types";

/**
 * Email sent when a membership is automatically renewed (auto-approved).
 */
export const membershipRenewedTemplate: EmailTemplate<MembershipApprovedMetadata> = {
  type: "membership_renewed",

  render(locale, metadata, LL) {
    const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "long" });

    return {
      subject: LL.emails.membershipRenewed.subject(),
      text: LL.emails.membershipRenewed.body({
        firstName: metadata.firstName,
        membershipName: metadata.membershipName,
        startDate: dateFormatter.format(metadata.startDate),
        endDate: dateFormatter.format(metadata.endDate),
      }),
    };
  },
};
