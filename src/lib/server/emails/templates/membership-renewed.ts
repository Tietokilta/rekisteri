import type { EmailTemplate, MembershipApprovedMetadata } from "../types";

/**
 * Email sent when a membership is automatically renewed (auto-approved).
 */
export const membershipRenewedTemplate: EmailTemplate<MembershipApprovedMetadata> = {
  type: "membership_renewed",

  render(_locale, metadata, LL, organizationName) {
    return {
      subject: LL.emails.membershipRenewed.subject(),
      text: LL.emails.membershipRenewed.body({
        firstName: metadata.firstName,
        membershipName: metadata.membershipName,
        organizationName,
      }),
    };
  },
};
