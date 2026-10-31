import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
  createEmailOTP,
  emailCookieName,
  getEmailOTPFromRequest,
  sendOTPEmail,
  setEmailOTPCookie,
} from "#lib/server/auth/email.js";
import { signInRestartHref } from "#lib/server/auth/sign-in-next.js";

export const load: PageServerLoad = async (event) => {
  const email = event.cookies.get(emailCookieName);
  if (typeof email !== "string") {
    return redirect(302, signInRestartHref(event));
  }

  let otp = await getEmailOTPFromRequest(event);
  if (otp === null || Date.now() >= otp.expiresAt.getTime()) {
    otp = await createEmailOTP(email);
    sendOTPEmail(otp.email, otp.code, event.locals.locale);
    setEmailOTPCookie(event, otp);
  }
  return {
    email: otp.email,
  };
};
