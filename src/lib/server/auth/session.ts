import type { RequestEvent } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { dev } from "$app/environment";
import { env } from "$lib/server/env";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export const sessionCookieName = "auth-session";

export function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = encodeBase64url(bytes);
  return token;
}

export async function createSession(token: string, userId: string) {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const session: table.Session = {
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + DAY_IN_MS * 30),
  };
  await db.insert(table.session).values(session);
  return session;
}

export async function validateSessionToken(token: string) {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const [result] = await db
    .select({
      // Adjust user table here to tweak returned data
      user: {
        id: table.user.id,
        email: table.user.email,
        firstNames: table.user.firstNames,
        lastName: table.user.lastName,
        homeMunicipality: table.user.homeMunicipality,
        preferredLanguage: table.user.preferredLanguage,
        isAllowedEmails: table.user.isAllowedEmails,
        isAdmin: table.user.isAdmin,
      },
      session: table.session,
    })
    .from(table.session)
    .innerJoin(table.user, eq(table.session.userId, table.user.id))
    .where(eq(table.session.id, sessionId));

  if (!result) {
    return { session: null, user: null };
  }
  const { session, user } = result;

  const sessionExpired = Date.now() >= session.expiresAt.getTime();
  if (sessionExpired) {
    await db.delete(table.session).where(eq(table.session.id, session.id));
    return { session: null, user: null };
  }

  const renewSession = Date.now() >= session.expiresAt.getTime() - DAY_IN_MS * 15;
  if (renewSession) {
    session.expiresAt = new Date(Date.now() + DAY_IN_MS * 30);
    await db.update(table.session).set({ expiresAt: session.expiresAt }).where(eq(table.session.id, session.id));
  }

  return { session, user };
}

export type SessionValidationResult = Awaited<ReturnType<typeof validateSessionToken>>;

export async function invalidateSession(sessionId: string) {
  await db.delete(table.session).where(eq(table.session.id, sessionId));
}

export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date) {
  const cookieOptions: Parameters<typeof event.cookies.set>[2] = {
    expires: expiresAt,
    path: "/",
    httpOnly: true,
    secure: !dev,
    sameSite: "lax",
  };

  // Add domain if COOKIE_DOMAIN is set (for sharing across subdomains)
  if (env.COOKIE_DOMAIN) {
    cookieOptions.domain = env.COOKIE_DOMAIN;
  }

  event.cookies.set(sessionCookieName, token, cookieOptions);
}

export function deleteSessionTokenCookie(event: RequestEvent) {
  const cookieOptions: Parameters<typeof event.cookies.delete>[1] = {
    path: "/",
  };

  // Add domain if COOKIE_DOMAIN is set (for sharing across subdomains)
  if (env.COOKIE_DOMAIN) {
    cookieOptions.domain = env.COOKIE_DOMAIN;
  }

  event.cookies.delete(sessionCookieName, cookieOptions);
}
