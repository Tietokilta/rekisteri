import { sequence } from "@sveltejs/kit/hooks";
import type { Handle, ServerInit } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session.js";
import { baseLocale, locales, type Locale } from "$lib/i18n/routing";
import { dev } from "$app/environment";
import cron from "node-cron";
import { cleanupExpiredTokens, cleanupOldAuditLogs } from "$lib/server/db/cleanup";
import { createInitialModeExpression } from "mode-watcher";
import type { PreferredLanguage } from "$lib/server/db/schema";

const handleLocaleRedirect: Handle = ({ event, resolve }) => {
	const pathname = event.url.pathname;
	if (pathname.startsWith("/api/") || pathname.startsWith("/_app/")) {
		return resolve(event);
	}

	const segments = pathname.split("/");
	const maybeLocale = segments[1];
	// If already has locale or is root (handled by +page.server.ts), continue
	if (!maybeLocale || locales.includes(maybeLocale as Locale)) {
		return resolve(event);
	}

	redirect(302, `/${baseLocale}${pathname}`);
};

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
 * Convert preferred language enum to locale code
 */
function preferredLanguageToLocale(preferredLanguage: PreferredLanguage): Locale | null {
	switch (preferredLanguage) {
		case "finnish":
			return "fi";
		case "english":
			return "en";
		case "unspecified":
			return null;
		default:
			return null;
	}
}

/**
 * Redirect logged-in users to their preferred language if:
 * - User is authenticated
 * - User has a preferred language set (not "unspecified")
 * - Current URL doesn't already use their preferred language
 */
const handlePreferredLanguage: Handle = async ({ event, resolve }) => {
	// Skip redirect for API routes, webhooks, and static assets
	if (
		event.url.pathname.startsWith("/api/") ||
		event.url.pathname.startsWith("/_app/") ||
		/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(event.url.pathname)
	) {
		return resolve(event);
	}

	// Check if user is logged in and has a preferred language
	if (event.locals.user?.preferredLanguage) {
		const preferredLocale = preferredLanguageToLocale(event.locals.user.preferredLanguage);

		if (preferredLocale) {
			// Get current locale from route params (will be undefined for root path)
			const currentLocale = event.params.locale || baseLocale;

			// Only redirect if the current locale is different from preferred
			if (currentLocale !== preferredLocale) {
				// Replace the locale in the pathname
				const pathname = event.url.pathname;
				const segments = pathname.split("/").filter(Boolean);
				
				// If first segment is a valid locale, replace it
				if (segments[0] && locales.includes(segments[0] as Locale)) {
					segments[0] = preferredLocale;
				} else {
					// Otherwise prepend the preferred locale
					segments.unshift(preferredLocale);
				}
				
				const newPathname = "/" + segments.join("/");
				// Preserve query parameters and hash
				const newUrl = `${newPathname}${event.url.search}${event.url.hash}`;
				throw redirect(302, newUrl);
			}
		}
	}

	return resolve(event);
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
	// Protect all /admin routes - requires authenticated admin user
	if (/^\/[a-z]{2}\/admin($|\/)/.test(event.url.pathname) && (!event.locals.session || !event.locals.user?.isAdmin)) {
		return new Response("Not found", { status: 404 });
	}

	return resolve(event);
};

export const handle: Handle = sequence(
	handleLocaleRedirect,
	handleAuth,
	handlePreferredLanguage,
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
};
