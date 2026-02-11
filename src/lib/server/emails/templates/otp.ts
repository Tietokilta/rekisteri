import type { EmailTemplate, OTPMetadata } from "../types";
import { env } from "$lib/server/env";

export const otpTemplate: EmailTemplate<OTPMetadata> = {
  type: "otp",

  render(locale, metadata, LL) {
    const { code } = metadata;

    // Format for auto-extraction (Apple/Android)
    // @domain helps devices know where this OTP is valid
    const body =
      locale === "fi"
        ? `Kirjautumiskoodisi on: ${code}

Koodi vanhenee 10 minuutin kuluttua.

@${env.RP_ID} #${code}`
        : `Your login code is: ${code}

This code will expire in 10 minutes.

@${env.RP_ID} #${code}`;

    return {
      subject: LL.emails.otp.subject(),
      text: body,
    };
  },
};
