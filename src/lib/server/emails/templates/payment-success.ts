import type { EmailTemplate, PaymentSuccessMetadata } from "../types";

export const paymentSuccessTemplate: EmailTemplate<PaymentSuccessMetadata> = {
  type: "payment_success",

  render(locale, metadata, LL) {
    const { membershipName, amount, currency } = metadata;

    const formatter = new Intl.NumberFormat(locale, {
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
