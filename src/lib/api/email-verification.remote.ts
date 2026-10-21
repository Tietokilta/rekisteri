import { error, invalid, redirect } from "@sveltejs/kit";
import { form, getRequestEvent } from "$app/server";
import * as v from "valibot";
import { dev } from "$app/environment";
import { env } from "$lib/server/env";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import { sendOTPBucket } from "$lib/server/auth/email";
import {
  confirmSecondaryEmail,
  startSecondaryEmailVerification,
  switchToEmailOwner,
} from "$lib/server/auth/email-verification";
import { getLL } from "$lib/server/i18n";
import { route } from "$lib/ROUTES";
import { resolveNext } from "$lib/utils/next";

// The only domain verified inline for now (student status)
const STUDENT_EMAIL_DOMAIN = "aalto.fi";

// Same limit as adding emails in settings: 10 per user per hour
const isRateLimitDisabled = dev || env.UNSAFE_DISABLE_RATE_LIMITS;
const sendCodeBucket = new ExpiringTokenBucket<string>(isRateLimitDisabled ? 1000 : 10, 60 * 60);

/**
 * Send a verification code to a student email, adding it as an unverified secondary email.
 * Never reveals whether the address is used by another account.
 */
export const sendStudentEmailCode = form(
  v.object({ email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()) }),
  async ({ email }, issue) => {
    const event = getRequestEvent();
    const LL = getLL(event.locals.locale);
    if (!event.locals.user) {
      error(401, LL.error.notAuthenticated());
    }

    if (!email.endsWith(`@${STUDENT_EMAIL_DOMAIN}`)) {
      return invalid(issue.email(LL.emailVerification.wrongDomain({ domain: STUDENT_EMAIL_DOMAIN })));
    }

    sendCodeBucket.cleanup();
    sendOTPBucket.cleanup();
    if (!sendCodeBucket.consume(event.locals.user.id, 1) || !sendOTPBucket.consume(email, 1)) {
      error(429, LL.error.tooManyRequests());
    }

    try {
      await startSecondaryEmailVerification(event, event.locals.user.id, email);
    } catch (err) {
      const messages: Record<string, string> = {
        "This is already your primary email": LL.secondaryEmail.alreadyPrimary(),
        "Maximum 10 secondary emails allowed": LL.secondaryEmail.limitReached(),
      };
      const message = err instanceof Error ? messages[err.message] : undefined;
      if (message) {
        return invalid(issue.email(message));
      }
      throw err;
    }

    return { email };
  },
);

/**
 * Check the code. Returns "verified", or "conflict" if the address has its own account.
 */
export const verifyStudentEmailCode = form(
  v.object({ code: v.pipe(v.string(), v.trim(), v.minLength(1)) }),
  async ({ code }, issue) => {
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
      return invalid(issue.code(LL.auth.codeExpiredResent()));
    }
    return result;
  },
);

/**
 * Sign in to the account that owns the address, using the code the user just entered.
 */
export const switchToEmailAccount = form(
  v.object({ code: v.pipe(v.string(), v.trim(), v.minLength(1)), next: v.optional(v.string()) }),
  async ({ code, next }, issue) => {
    const event = getRequestEvent();
    const LL = getLL(event.locals.locale);

    const result = await switchToEmailOwner(event, code);
    if (result.status === "invalid") {
      return invalid(issue.code(LL.auth.incorrectCode()));
    }
    if (result.status === "expired_resent") {
      return invalid(issue.code(LL.auth.codeExpiredResent()));
    }

    redirect(303, resolveNext(next, event.locals.locale) ?? route("/[locale=locale]", { locale: event.locals.locale }));
  },
);
