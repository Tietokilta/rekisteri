import type { EmailTemplate, MembershipApprovedMetadata } from "../types";

export const membershipRejectedTemplate: EmailTemplate<MembershipApprovedMetadata> = {
  type: "membership_rejected",

  render(_locale, metadata, LL) {
    const { firstName, membershipName } = metadata;

    return {
      subject: LL.emails.membershipRejected.subject(),
      text: LL.emails.membershipRejected.body({
        firstName,
        membershipName,
      }),
    };
  },
};
