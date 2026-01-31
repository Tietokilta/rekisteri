import type { EmailTemplate, OTPMetadata } from "../types";

export const otpTemplate: EmailTemplate<OTPMetadata> = {
  type: "otp",

  render(locale, metadata, LL) {
    const { code } = metadata;

    // Format for auto-extraction (Apple/Android)
    const body =
      locale === "fi"
        ? `Kirjautumiskoodisi on: ${code}

Koodi vanhenee 10 minuutin kuluttua.

@tietokilta.fi #${code}`
        : `Your login code is: ${code}

This code will expire in 10 minutes.

@tietokilta.fi #${code}`;

    return {
      subject: LL.emails.otp.subject(),
      text: body,
    };
  },
};
