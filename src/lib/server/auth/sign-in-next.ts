import type { RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/env";
import { env } from "#lib/server/env.js";
import { route } from "#lib/ROUTES.js";
import { takeReturnTo } from "#lib/server/oidc/return-to.js";
import { resolveNext, withNext } from "#lib/utils/next.js";

// Remembers where to go after signing in, across the multi-step sign-in flow
const signInNextCookieName = "sign_in_next";

export function setSignInNextCookie(event: RequestEvent, next: string | null): void {
  const resolved = resolveNext(next, event.locals.locale);
  if (!resolved) {
    // Forget the target of an earlier, abandoned sign-in
    event.cookies.delete(signInNextCookieName, { path: "/" });
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

/** The sign-in page, returning to the current page afterwards. */
export function signInHref(event: RequestEvent): string {
  return withNext(
    route("/[locale=locale]/sign-in", { locale: event.locals.locale }),
    event.url.pathname + event.url.search,
  );
}

/** The sign-in page, keeping the remembered destination when going back to change the email. */
export function signInRestartHref(event: RequestEvent): string {
  const href = route("/[locale=locale]/sign-in", { locale: event.locals.locale });
  const next = event.cookies.get(signInNextCookieName);
  return next ? withNext(href, next) : href;
}

/**
 * Return the post-sign-in destination and clear the cookies: an app's OIDC login page if the
 * sign-in started there, otherwise the page the user tried to open, otherwise the front page.
 */
export function consumeSignInNext(event: RequestEvent): string {
  const returnTo = takeReturnTo(event.cookies);
  const next = event.cookies.get(signInNextCookieName);
  if (next) {
    event.cookies.delete(signInNextCookieName, { path: "/" });
  }
  return (
    returnTo ?? resolveNext(next, event.locals.locale) ?? route("/[locale=locale]", { locale: event.locals.locale })
  );
}
