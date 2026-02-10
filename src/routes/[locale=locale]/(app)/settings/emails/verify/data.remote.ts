import { error, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import { timingSafeEqual } from "node:crypto";
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
} from "$lib/server/auth/email";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import { route } from "$lib/ROUTES";
import { getUserSecondaryEmails, markSecondaryEmailVerified } from "$lib/server/auth/secondary-email";
import { verifyCodeSchema } from "./schema";
import { getLL } from "$lib/server/i18n";

const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

export const verifyCode = form(verifyCodeSchema, async ({ code, next }) => {
  const event = getRequestEvent();

  const LL = getLL(event.locals.locale);

  // Lazy cleanup to prevent memory leaks
  otpVerifyBucket.cleanup();

  let otp = await getEmailOTPFromRequest(event);
  if (otp === null) {
    error(401, LL.error.notAuthenticated());
  }

  if (!otpVerifyBucket.check(otp.email, 1)) {
    error(429, LL.error.tooManyRequests());
  }

  if (!otpVerifyBucket.consume(otp.email, 1)) {
    error(429, LL.error.tooManyRequests());
  }

  if (Date.now() >= otp.expiresAt.getTime()) {
    otp = await createEmailOTP(otp.email);
    sendOTPEmail(otp.email, otp.code, event.locals.locale);
    return {
      message: LL.auth.codeExpiredResent(),
    };
  }

  const capitalizedCode = code.toLocaleUpperCase("en");

  // Use constant-time comparison to prevent timing attacks
  const expectedBuffer = Buffer.from(otp.code, "utf8");
  const providedBuffer = Buffer.from(capitalizedCode.padEnd(otp.code.length, "\0"), "utf8");
  const isValid = expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  if (!isValid) {
    error(400, LL.auth.incorrectCode());
  }

  // Find the secondary email record for this user
  if (!event.locals.user) {
    error(401, LL.error.notAuthenticated());
  }

  const secondaryEmails = await getUserSecondaryEmails(event.locals.user.id);
  const emailToVerify = secondaryEmails.find((e) => e.email === otp.email);

  if (!emailToVerify) {
    error(404, LL.auth.emailNotFound());
  }

  // Mark as verified
  await markSecondaryEmailVerified(emailToVerify.id, event.locals.user.id);

  deleteEmailCookie(event);
  deleteEmailOTP(otp.id);
  deleteEmailOTPCookie(event);

  // If the user was redirected here from another page (e.g. purchase flow),
  // redirect back there instead of the default emails management page.
  if (next) {
    // Resolve against our origin to guarantee a same-origin path redirect
    const safePath = new URL(next, event.url.origin).pathname;
    redirect(302, safePath);
  }

  redirect(302, route("/[locale=locale]/settings/emails", { locale: event.locals.locale }));
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
