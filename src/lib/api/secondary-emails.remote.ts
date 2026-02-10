import { error, redirect, isRedirect, isHttpError, invalid } from "@sveltejs/kit";
import { getRequestEvent, query, form } from "$app/server";
import * as v from "valibot";
import { dev } from "$app/environment";
import {
  getUserSecondaryEmails,
  deleteSecondaryEmail,
  getSecondaryEmailById,
  createSecondaryEmail,
  changePrimaryEmail,
} from "$lib/server/auth/secondary-email";
import { createEmailOTP, sendOTPEmail, emailCookieName, emailOTPCookieName } from "$lib/server/auth/email";
import { route } from "$lib/ROUTES";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import { addSecondaryEmailSchema } from "./secondary-emails.schema";
import { env } from "$lib/server/env";
import { getLL } from "$lib/server/i18n";

// Rate limit: 10 add attempts per user per hour in production, 1000 in test mode
// SECURITY: Prevents email enumeration attacks
// Higher limit when UNSAFE_DISABLE_RATE_LIMITS is set (for e2e tests)
const isRateLimitDisabled = dev || env.UNSAFE_DISABLE_RATE_LIMITS;
const addEmailBucket = new ExpiringTokenBucket<string>(isRateLimitDisabled ? 1000 : 10, 60 * 60);

/**
 * List all secondary emails for the authenticated user
 */
export const listSecondaryEmails = query(async () => {
  const { locals } = getRequestEvent();

  if (!locals.user) {
    const LL = getLL(locals.locale);
    throw error(401, LL.error.notAuthenticated());
  }

  const emails = await getUserSecondaryEmails(locals.user.id);

  return { emails };
});

/**
 * Delete a secondary email via form submission
 */
export const deleteSecondaryEmailForm = form(
  v.object({
    emailId: v.pipe(v.string(), v.minLength(1)),
  }),
  async ({ emailId }) => {
    const { locals } = getRequestEvent();

    const LL = getLL(locals.locale);

    if (!locals.user) {
      throw error(401, LL.error.notAuthenticated());
    }

    const success = await deleteSecondaryEmail(emailId, locals.user.id);

    if (!success) {
      throw error(404, LL.secondaryEmail.emailNotFound());
    }

    // Refresh the email list
    await listSecondaryEmails().refresh();

    return { success: true };
  },
);

/**
 * Re-verify an expired or unverified email
 */
export const reverifySecondaryEmailForm = form(
  v.object({
    emailId: v.pipe(v.string(), v.minLength(1)),
    next: v.optional(v.string()),
  }),
  async ({ emailId, next }) => {
    const { locals, cookies } = getRequestEvent();

    const LL = getLL(locals.locale);

    if (!locals.user) {
      throw error(401, LL.error.notAuthenticated());
    }

    const email = await getSecondaryEmailById(emailId, locals.user.id);
    if (!email) {
      throw error(404, LL.secondaryEmail.emailNotFound());
    }

    // Create OTP and send email
    const otp = await createEmailOTP(email.email);
    sendOTPEmail(email.email, otp.code, locals.locale);

    // Set cookies for verification flow (matching email.ts pattern)
    cookies.set(emailCookieName, email.email, {
      expires: otp.expiresAt,
      path: "/",
      httpOnly: true,
      secure: !dev,
      sameSite: "lax",
    });

    // Set OTP cookie (otp.id is already encoded, don't double-encode it)
    cookies.set(emailOTPCookieName, otp.id, {
      expires: otp.expiresAt,
      path: "/",
      httpOnly: true,
      secure: !dev,
      sameSite: "lax",
    });

    // Server-side redirect ensures cookies are properly set before navigation
    const verifyUrl = route("/[locale=locale]/settings/emails/verify", { locale: locals.locale });
    redirect(303, next ? `${verifyUrl}?next=${encodeURIComponent(next)}` : verifyUrl);
  },
);

/**
 * Change primary email via form submission
 */
export const changePrimaryEmailForm = form(
  v.object({
    emailId: v.pipe(v.string(), v.minLength(1, "Email ID is required")),
  }),
  async ({ emailId }) => {
    const event = getRequestEvent();

    const LL = getLL(event.locals.locale);

    if (!event.locals.user) {
      throw error(401, LL.error.notAuthenticated());
    }

    const success = await changePrimaryEmail(emailId, event.locals.user.id, event);

    if (!success) {
      throw error(400, LL.secondaryEmail.couldNotChangePrimary());
    }
  },
);

/**
 * Add a new secondary email via form submission
 */
export const addSecondaryEmailForm = form(addSecondaryEmailSchema, async ({ email, next }, issue) => {
  const { locals, cookies } = getRequestEvent();

  // Lazy cleanup to prevent memory leaks
  addEmailBucket.cleanup();

  const LL = getLL(locals.locale);

  if (!locals.user) {
    throw error(401, LL.error.notAuthenticated());
  }

  // Rate limit by user ID to prevent enumeration
  if (!addEmailBucket.consume(locals.user.id, 1)) {
    throw error(429, LL.secondaryEmail.tooManyAttempts());
  }

  // Translation map for errors thrown by createSecondaryEmail / extractDomain
  const errorTranslations: Record<string, string> = {
    "Invalid email format": LL.secondaryEmail.invalidEmail(),
    "Invalid email format: missing domain": LL.secondaryEmail.invalidEmail(),
    "Could not add this email. Please try a different email address.": LL.secondaryEmail.couldNotAdd(),
    "Maximum 10 secondary emails allowed": LL.secondaryEmail.limitReached(),
  };

  try {
    // Create unverified secondary email
    await createSecondaryEmail(locals.user.id, email);

    // Create OTP and send
    const otp = await createEmailOTP(email);
    sendOTPEmail(email, otp.code, locals.locale);

    // Set cookies for verification (matching email.ts pattern)
    cookies.set(emailCookieName, email, {
      expires: otp.expiresAt,
      path: "/",
      httpOnly: true,
      secure: !dev,
      sameSite: "lax",
    });

    // Set OTP cookie (otp.id is already encoded, don't double-encode it)
    cookies.set(emailOTPCookieName, otp.id, {
      expires: otp.expiresAt,
      path: "/",
      httpOnly: true,
      secure: !dev,
      sameSite: "lax",
    });

    const verifyUrl = route("/[locale=locale]/settings/emails/verify", { locale: locals.locale });
    redirect(303, next ? `${verifyUrl}?next=${encodeURIComponent(next)}` : verifyUrl);
  } catch (err) {
    // Re-throw SvelteKit errors (redirect, error, etc.)
    if (isRedirect(err) || isHttpError(err)) {
      throw err;
    }
    // Use invalid.email() to attach error to the email field
    if (err instanceof Error) {
      const translated = errorTranslations[err.message] ?? err.message;
      return invalid(issue.email(translated));
    }
    return invalid(issue.email(LL.error.genericError()));
  }
});
