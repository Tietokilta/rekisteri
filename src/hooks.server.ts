import { sequence } from "@sveltejs/kit/hooks";
import type { Handle, ServerInit } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session.js";
import { baseLocale, locales, preferredLanguageToLocale, type Locale } from "$lib/i18n/routing";
import { dev } from "$app/environment";
import cron from "node-cron";
import { cleanupExpiredTokens, cleanupInactiveUsers, cleanupOldAuditLogs } from "$lib/server/db/cleanup";
import { createInitialModeExpression } from "mode-watcher";

const handleAuth: Handle = async ({ event, resolve }) => {
  const sessionToken = event.cookies.get(auth.sessionCookieName);
  if (!sessionToken) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  const { session, user } = await auth.validateSessionToken(sessionToken);
  if (session) {
    auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
  } else {
    auth.deleteSessionTokenCookie(event);
  }

  event.locals.user = user;
  event.locals.session = session;

  return resolve(event);
};

/**
 * Locale redirect handler that adds locale to paths without one.
 * Uses user's preferred language if set, otherwise uses base locale.
 * Respects explicit locale in URL - only redirects when NO locale is present.
 */
const handleLocaleRedirect: Handle = ({ event, resolve }) => {
  const pathname = event.url.pathname;

  // Only redirect GET requests - other methods (POST, PUT, DELETE, etc.) should handle their own responses
  if (event.request.method !== "GET") {
    return resolve(event);
  }

  // Skip redirect for API routes, static assets, and SvelteKit internals
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_app/") ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(pathname)
  ) {
    return resolve(event);
  }

  const segments = pathname.split("/");
  const maybeLocale = segments[1];

  // If already has a valid locale or is root path (handled by +page.server.ts), don't redirect
  // This allows users to explicitly choose a locale in the URL
  if (!maybeLocale || locales.includes(maybeLocale as Locale)) {
    return resolve(event);
  }

  // Path has no locale - determine which locale to use
  let targetLocale: Locale = baseLocale;

  if (event.locals.user?.preferredLanguage) {
    // Use user's preferred language if they have one
    const preferredLocale = preferredLanguageToLocale(event.locals.user.preferredLanguage);
    targetLocale = preferredLocale || baseLocale;
  }

  // Redirect to the same path with locale prepended
  redirect(302, `/${targetLocale}${pathname}${event.url.search}`);
};

const handleI18n: Handle = ({ event, resolve }) => {
  const locale = (event.params.locale as string) || baseLocale;
  event.locals.locale = locale as typeof baseLocale;

  return resolve(event, {
    transformPageChunk: ({ html }) => {
      return html
        .replace("%lang%", event.locals.locale)
        .replace("%modewatcher.snippet%", createInitialModeExpression());
    },
  });
};

const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Set additional security headers not covered by CSP config in `svelte.config.js`
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Enable HSTS in production to enforce HTTPS
  if (!dev) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
};

const handleAdminAuthorization: Handle = async ({ event, resolve }) => {
  // Protect all admin routes - requires authenticated admin user
  // Using route.id is more robust than pathname matching
  if (event.route.id?.includes("/admin/") && (!event.locals.session || !event.locals.user?.isAdmin)) {
    return new Response("Not found", { status: 404 });
  }

  return resolve(event);
};

export const handle: Handle = sequence(
  handleAuth,
  handleLocaleRedirect,
  handleAdminAuthorization,
  handleSecurityHeaders,
  handleI18n,
);

export const init: ServerInit = () => {
  // Schedule cleanup tasks
  // Run database cleanup daily at 3 AM (when traffic is typically lowest)
  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] Running daily database cleanup...");
    try {
      await cleanupExpiredTokens();
      await cleanupOldAuditLogs(); // 90 day retention (default)
    } catch (error) {
      console.error("[Cron] Database cleanup failed:", error);
    }
  });

  // Run GDPR cleanup weekly on Sundays at 4 AM
  // Removes users inactive for 6+ years per GDPR data minimization requirements
  cron.schedule("0 4 * * 0", async () => {
    console.log("[Cron] Running weekly GDPR cleanup...");
    try {
      await cleanupInactiveUsers(); // 6 year retention (default)
    } catch (error) {
      console.error("[Cron] GDPR cleanup failed:", error);
    }
  });
};
