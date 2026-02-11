import type { EmailTemplate, PaymentSuccessMetadata } from "../types";

export const paymentSuccessTemplate: EmailTemplate<PaymentSuccessMetadata> = {
  type: "payment_success",

  render(locale, metadata, LL) {
    const { membershipName, amount, currency } = metadata;

    // Use Finnish formatting conventions regardless of UI language
    const formatter = new Intl.NumberFormat(`${locale}-FI`, {
      style: "currency",
      currency,
    });

    return {
      subject: LL.emails.paymentSuccess.subject(),
      text: LL.emails.paymentSuccess.body({
        membershipName,
        amount: formatter.format(amount / 100), // Stripe amounts in cents
      }),
    };
  },
};
