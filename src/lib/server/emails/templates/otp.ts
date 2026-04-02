import type { EmailTemplate, OTPMetadata } from "../types";
import { env } from "$lib/server/env";

export const otpTemplate: EmailTemplate<OTPMetadata> = {
  type: "otp",

  render(locale, metadata, LL, organizationName, organizationNameShort) {
    const { code } = metadata;

    // Format for auto-extraction (Apple/Android)
    // @domain helps devices know where this OTP is valid
    return {
      subject: LL.emails.otp.subject({ organizationName }),
      text: LL.emails.otp.body({
        code,
        domain: env.RP_ID,
        organizationNameShort,
      }),
    };
  },
};
