import { error, type RequestEvent } from "@sveltejs/kit";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type { EmailOTP } from "$lib/server/db/schema";
import {
  createEmailOTP,
  deleteEmailCookie,
  deleteEmailOTP,
  deleteEmailOTPCookie,
  getEmailOTPFromRequest,
  sendOTPEmail,
  setEmailCookie,
  setEmailOTPCookie,
} from "$lib/server/auth/email";
import { ExpiringTokenBucket } from "$lib/server/auth/rate-limit";
import {
  createSession,
  generateSessionToken,
  invalidateSession,
  setSessionTokenCookie,
} from "$lib/server/auth/session";
import {
  createSecondaryEmail,
  getUserByEmail,
  getUserSecondaryEmails,
  markSecondaryEmailVerified,
} from "$lib/server/auth/secondary-email";
import { createAuditLog } from "$lib/server/audit";
import { getLL } from "$lib/server/i18n";

// 5 code attempts per address per 30 minutes, shared by verifying and switching accounts
const otpVerifyBucket = new ExpiringTokenBucket<string>(5, 60 * 30);

/**
 * Add an unverified secondary email for the user and send a code to it.
 *
 * Responds the same way whether or not another account uses the address,
 * so it can't be used to find out which emails are registered.
 */
export async function startSecondaryEmailVerification(event: RequestEvent, userId: string, email: string) {
  await createSecondaryEmail(userId, email);

  const otp = await createEmailOTP(email);
  sendOTPEmail(otp.email, otp.code, event.locals.locale);
  setEmailCookie(event, otp.email, otp.expiresAt);
  setEmailOTPCookie(event, otp);
}

type CodeCheck = { status: "ok"; otp: EmailOTP } | { status: "invalid" } | { status: "expired_resent" };

/** Check a code against the OTP in this browser's cookies. Throws on missing OTP or rate limit. */
async function checkCode(event: RequestEvent, code: string): Promise<CodeCheck> {
  const LL = getLL(event.locals.locale);
  otpVerifyBucket.cleanup();

  const otp = await getEmailOTPFromRequest(event);
  if (otp === null) {
    error(401, LL.error.notAuthenticated());
  }

  if (!otpVerifyBucket.consume(otp.email, 1)) {
    error(429, LL.error.tooManyRequests());
  }

  if (Date.now() >= otp.expiresAt.getTime()) {
    const fresh = await createEmailOTP(otp.email);
    sendOTPEmail(fresh.email, fresh.code, event.locals.locale);
    setEmailOTPCookie(event, fresh);
    return { status: "expired_resent" };
  }

  // Constant-time comparison, padded to the expected length
  const expected = Buffer.from(otp.code, "utf8");
  const provided = Buffer.from(code.toLocaleUpperCase("en").padEnd(otp.code.length, "\0"), "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { status: "invalid" };
  }

  return { status: "ok", otp };
}

function clearCode(event: RequestEvent, otp: EmailOTP) {
  deleteEmailCookie(event);
  void deleteEmailOTP(otp.id);
  deleteEmailOTPCookie(event);
}

export type ConfirmResult =
  | { status: "verified"; email: string; expiresAt: Date | null }
  | { status: "conflict"; email: string }
  | { status: "invalid" }
  | { status: "expired_resent" };

/**
 * Verify the code for a secondary email the user is adding.
 *
 * If the address turns out to belong to another account, it is not added and
 * "conflict" is returned. The code stays valid so the user can use it to sign
 * in to that account with switchToEmailOwner.
 */
export async function confirmSecondaryEmail(event: RequestEvent, userId: string, code: string): Promise<ConfirmResult> {
  const LL = getLL(event.locals.locale);

  const check = await checkCode(event, code);
  if (check.status !== "ok") {
    return check;
  }
  const { otp } = check;

  const secondaryEmails = await getUserSecondaryEmails(userId);
  const emailToVerify = secondaryEmails.find((e) => e.email === otp.email);
  if (!emailToVerify) {
    error(404, LL.auth.emailNotFound());
  }

  const result = await markSecondaryEmailVerified(emailToVerify.id, userId);
  if (result.status === "not_found") {
    error(404, LL.auth.emailNotFound());
  }
  if (result.status === "conflict") {
    // The claim can never be verified by this user, so don't leave it behind
    await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.id, emailToVerify.id));
    return { status: "conflict", email: otp.email };
  }

  clearCode(event, otp);
  return { status: "verified", email: otp.email, expiresAt: result.email.expiresAt };
}

/**
 * An account is "empty" if deleting it loses nothing the user would miss:
 * no memberships, passkeys, verified secondary emails, meeting attendance or admin role.
 * Typically created moments ago by signing in with a new address.
 */
async function isEmptyAccount(userId: string): Promise<boolean> {
  const [user] = await db.select({ adminRole: table.user.adminRole }).from(table.user).where(eq(table.user.id, userId));
  if (!user || user.adminRole !== "none") return false;

  const [member, passkey, verifiedEmail, attendance] = await Promise.all([
    db.select({ id: table.member.id }).from(table.member).where(eq(table.member.userId, userId)).limit(1),
    db.select({ id: table.passkey.id }).from(table.passkey).where(eq(table.passkey.userId, userId)).limit(1),
    db
      .select({ id: table.secondaryEmail.id })
      .from(table.secondaryEmail)
      .where(and(eq(table.secondaryEmail.userId, userId), isNotNull(table.secondaryEmail.verifiedAt)))
      .limit(1),
    db
      .select({ id: table.meetingAttendee.id })
      .from(table.meetingAttendee)
      .where(eq(table.meetingAttendee.userId, userId))
      .limit(1),
  ]);

  return member.length === 0 && passkey.length === 0 && verifiedEmail.length === 0 && attendance.length === 0;
}

export type SwitchResult = { status: "switched" } | { status: "invalid" } | { status: "expired_resent" };

/**
 * Sign in to the account that owns the address the user just proved they control.
 *
 * The code from confirmSecondaryEmail is checked again here, so this is as strong
 * as signing in with that address. If the account being left is empty, it is
 * deleted (its audit history moves to the other account), so the address can be
 * added to the other account later without another conflict.
 */
export async function switchToEmailOwner(event: RequestEvent, code: string): Promise<SwitchResult> {
  const LL = getLL(event.locals.locale);
  const currentUser = event.locals.user;
  const currentSession = event.locals.session;
  if (!currentUser || !currentSession) {
    error(401, LL.error.notAuthenticated());
  }

  const check = await checkCode(event, code);
  if (check.status !== "ok") {
    return check;
  }
  const { otp } = check;

  const owner = await getUserByEmail(otp.email);
  if (!owner || owner.id === currentUser.id) {
    error(400, LL.error.genericError());
  }

  const deleteCurrent = await isEmptyAccount(currentUser.id);

  if (deleteCurrent) {
    await db.transaction(async (tx) => {
      await tx.delete(table.session).where(eq(table.session.userId, currentUser.id));
      await tx.update(table.auditLog).set({ userId: owner.id }).where(eq(table.auditLog.userId, currentUser.id));
      // Unverified secondary emails are removed by cascade
      await tx.delete(table.user).where(eq(table.user.id, currentUser.id));
    });
  } else {
    await invalidateSession(currentSession.id);
  }
  clearCode(event, otp);

  const token = generateSessionToken();
  const session = await createSession(token, owner.id);
  setSessionTokenCookie(event, token, session.expiresAt);

  await createAuditLog({
    userId: owner.id,
    action: "auth.account_switch",
    targetType: "user",
    targetId: owner.id,
    metadata: {
      fromUserId: currentUser.id,
      fromEmail: currentUser.email,
      verifiedEmail: otp.email,
      deletedFromAccount: deleteCurrent,
    },
    ipAddress: event.getClientAddress(),
    userAgent: event.request.headers.get("user-agent") || undefined,
  });

  return { status: "switched" };
}
