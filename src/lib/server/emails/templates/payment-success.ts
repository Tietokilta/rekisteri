import type { EmailTemplate, PaymentSuccessMetadata } from "../types";

export const paymentSuccessTemplate: EmailTemplate<PaymentSuccessMetadata> = {
  type: "payment_success",

  render(locale, metadata, LL) {
    const { membershipName, amount, currency } = metadata;

    // Use Finnish region for formatting (e.g., 'fi-FI' or 'en-FI')
    // This ensures locale-appropriate formatting with Finnish regional conventions
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
