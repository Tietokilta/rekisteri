import type { EmailTemplate, MembershipReactivatedMetadata } from "../types";

export const membershipReactivatedTemplate: EmailTemplate<MembershipReactivatedMetadata> = {
  type: "membership_reactivated",

  render(_locale, metadata, LL) {
    const { firstName, membershipName } = metadata;

    return {
      subject: LL.emails.membershipReactivated.subject(),
      text: LL.emails.membershipReactivated.body({
        firstName,
        membershipName,
      }),
    };
  },
};
