import type { EmailTemplate, MembershipApprovedMetadata } from "../types";

export const membershipApprovedTemplate: EmailTemplate<MembershipApprovedMetadata> = {
  type: "membership_approved",

  render(locale, metadata, LL, organizationName) {
    const { firstName, membershipName } = metadata;

    return {
      subject: LL.emails.membershipApproved.subject({ organizationName }),
      text: LL.emails.membershipApproved.body({
        firstName,
        membershipName,
        organizationName,
      }),
    };
  },
};
