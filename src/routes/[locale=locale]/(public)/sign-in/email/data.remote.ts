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
import { createSession, generateSessionToken, setSessionTokenCookie } from "$lib/server/auth/session";
import { getUserByEmail, deleteUnverifiedSecondaryEmailClaims } from "$lib/server/auth/secondary-email";
import { generateUserId } from "$lib/server/auth/utils";
import * as table from "$lib/server/db/schema";
import { db } from "$lib/server/db";
import { route } from "$lib/ROUTES";
import { auditLogin, auditLoginFailed } from "$lib/server/audit";
import { verifyCodeSchema } from "./schema";
import { getLL } from "$lib/server/i18n";

const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

export const verifyCode = form(verifyCodeSchema, async ({ code }) => {
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
  // Pad both strings to the expected OTP length
  const expectedBuffer = Buffer.from(otp.code, "utf8");
  const providedBuffer = Buffer.from(capitalizedCode.padEnd(otp.code.length, "\0"), "utf8");
  const isValid = expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  if (!isValid) {
    await auditLoginFailed(event, otp.email);
    error(400, LL.auth.incorrectCode());
  }

  // Check both primary and VERIFIED secondary emails
  // SECURITY: Only verified secondary emails can be used for authentication
  const existingUser = await getUserByEmail(otp.email);

  const userId = existingUser?.id ?? generateUserId();
  if (!existingUser) {
    // SECURITY: Delete any unverified secondary email claims for this email
    // This prevents email squatting attacks where an attacker adds someone else's
    // email as a secondary email to hijack their account when they sign up
    await deleteUnverifiedSecondaryEmailClaims(otp.email);

    await db.insert(table.user).values({
      id: userId,
      email: otp.email,
    });
  }

  const token = generateSessionToken();
  await createSession(token, userId);
  setSessionTokenCookie(event, token, new Date(Date.now() + 1000 * 60 * 60 * 24 * 30));

  await auditLogin(event, userId);

  deleteEmailCookie(event);
  deleteEmailOTP(otp.id);
  deleteEmailOTPCookie(event);

  redirect(302, route("/[locale=locale]", { locale: event.locals.locale }));
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

export const changeEmail = form(async () => {
  const event = getRequestEvent();

  // Get the OTP to delete it if it exists
  const otp = await getEmailOTPFromRequest(event);
  if (otp !== null) {
    deleteEmailOTP(otp.id);
  }

  // Clear cookies
  deleteEmailCookie(event);
  deleteEmailOTPCookie(event);

  // Redirect back to sign-in page
  redirect(303, route("/[locale=locale]/sign-in", { locale: event.locals.locale }));
});
