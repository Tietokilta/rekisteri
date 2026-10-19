import type { RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$lib/server/env";
import { route } from "$lib/ROUTES";
import { resolveNext } from "$lib/utils/next";

// Remembers where to go after signing in, across the multi-step sign-in flow
const signInNextCookieName = "sign_in_next";

export function setSignInNextCookie(event: RequestEvent, next: string | null): void {
  const resolved = resolveNext(next, event.locals.locale);
  if (!resolved) {
    return;
  }
  event.cookies.set(signInNextCookieName, resolved, {
    maxAge: 60 * 30,
    path: "/",
    httpOnly: true,
    secure: !dev && !env.TEST,
    sameSite: "lax",
  });
}

/** Return the post-sign-in destination and clear the cookie. Defaults to the front page. */
export function consumeSignInNext(event: RequestEvent): string {
  const next = event.cookies.get(signInNextCookieName);
  if (next) {
    event.cookies.delete(signInNextCookieName, { path: "/" });
  }
  return resolveNext(next, event.locals.locale) ?? route("/[locale=locale]", { locale: event.locals.locale });
}
