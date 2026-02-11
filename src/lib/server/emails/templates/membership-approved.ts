import type { EmailTemplate, MembershipApprovedMetadata } from "../types";

export const membershipApprovedTemplate: EmailTemplate<MembershipApprovedMetadata> = {
  type: "membership_approved",

  render(locale, metadata, LL) {
    const { firstName, membershipName, startDate, endDate } = metadata;

    // Use Finnish region for formatting (e.g., 'fi-FI' or 'en-FI')
    // This ensures locale-appropriate formatting with Finnish regional conventions
    const dateFormatter = new Intl.DateTimeFormat(`${locale}-FI`, {
      dateStyle: "long",
    });

    return {
      subject: LL.emails.membershipApproved.subject(),
      text: LL.emails.membershipApproved.body({
        firstName,
        membershipName,
        startDate: dateFormatter.format(startDate),
        endDate: dateFormatter.format(endDate),
      }),
    };
  },
};
