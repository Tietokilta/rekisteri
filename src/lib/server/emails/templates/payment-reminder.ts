import type { EmailTemplate, PaymentReminderMetadata } from "../types";

export const paymentReminderTemplate: EmailTemplate<PaymentReminderMetadata> = {
  type: "payment_reminder",

  render(locale, metadata, LL) {
    const { firstName, membershipName, dueDate, paymentLink } = metadata;

    const dateFormatter = new Intl.DateTimeFormat(`${locale}-FI`, {
      dateStyle: "long",
    });

    return {
      subject: LL.emails.paymentReminder.subject(),
      text: LL.emails.paymentReminder.body({
        firstName,
        membershipName,
        dueDate: dateFormatter.format(dueDate),
        paymentLink,
      }),
    };
  },
};
