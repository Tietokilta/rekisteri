import { error, invalid, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import {
  createEmailOTP,
  deleteEmailCookie,
  deleteEmailOTP,
  deleteEmailOTPCookie,
  emailCookieName,
  getEmailOTPFromRequest,
  sendOTPEmail,
  sendOTPBucket,
  setEmailOTPCookie,
} from "#lib/server/auth/email.js";
import { route } from "#lib/ROUTES.js";
import { resolveNext } from "#lib/utils/next.js";
import { confirmSecondaryEmail } from "#lib/server/auth/email-verification.js";
import { verifyCodeSchema } from "./schema";
import { getLL } from "#lib/server/i18n.js";

export const verifyCode = form(verifyCodeSchema, async ({ code, next }, issue) => {
  const event = getRequestEvent();

  const LL = getLL(event.locals.locale);

  if (!event.locals.user) {
    error(401, LL.error.notAuthenticated());
  }

  const result = await confirmSecondaryEmail(event, event.locals.user.id, code);
  if (result.status === "invalid") {
    return invalid(issue.code(LL.auth.incorrectCode()));
  }
  if (result.status === "expired_resent") {
    return { message: LL.auth.codeExpiredResent() };
  }
  if (result.status === "conflict") {
    // Shown only now that the user has proven they control the address
    return { conflict: result.email };
  }

  // If the user was redirected here from another page (e.g. purchase flow),
  // redirect back there instead of the default emails management page.
  redirect(
    302,
    resolveNext(next, event.locals.locale) ??
      route("/[locale=locale]/settings/emails", { locale: event.locals.locale }),
  );
});

export const resendEmail = form(async () => {
  const event = getRequestEvent();

  const LL = getLL(event.locals.locale);

  // Lazy cleanup to prevent memory leaks
  sendOTPBucket.cleanup();

  const email = event.cookies.get(emailCookieName);
  if (typeof email !== "string") {
    error(401, LL.error.notAuthenticated());
  }

  if (!sendOTPBucket.check(email, 1)) {
    error(429, LL.error.tooManyRequests());
  }

  if (!sendOTPBucket.consume(email, 1)) {
    error(429, LL.error.tooManyRequests());
  }

  const otp = await createEmailOTP(email);
  sendOTPEmail(otp.email, otp.code, event.locals.locale);
  setEmailOTPCookie(event, otp);

  return {
    message: LL.auth.codeSent(),
  };
});

export const cancelVerification = form(async () => {
  const event = getRequestEvent();

  // Get the OTP to delete it if it exists
  const otp = await getEmailOTPFromRequest(event);
  if (otp !== null) {
    deleteEmailOTP(otp.id);
  }

  // Clear cookies
  deleteEmailCookie(event);
  deleteEmailOTPCookie(event);

  // Redirect back to management page
  redirect(303, route("/[locale=locale]/settings/emails", { locale: event.locals.locale }));
});
