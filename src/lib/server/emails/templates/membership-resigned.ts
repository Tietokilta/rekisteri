import type { EmailTemplate, MembershipResignedMetadata } from "../types";

export const membershipResignedTemplate: EmailTemplate<MembershipResignedMetadata> = {
  type: "membership_resigned",

  render(_locale, metadata, LL) {
    const { firstName, membershipName, reason } = metadata;

    return {
      subject: LL.emails.membershipResigned.subject(),
      text: LL.emails.membershipResigned.body({
        firstName,
        membershipName,
        reason: reason ?? "",
      }),
    };
  },
};
