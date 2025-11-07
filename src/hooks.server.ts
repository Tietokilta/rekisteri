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
 * Unified locale redirect handler that:
 * 1. Adds locale to paths that don't have one (using user preference or base locale)
 * 2. Redirects authenticated users to their preferred language
 *
 * This avoids double redirects by handling both cases in one pass.
 */
const handleLocaleRedirect: Handle = ({ event, resolve }) => {
	const pathname = event.url.pathname;

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
	const currentLocale = maybeLocale && locales.includes(maybeLocale as Locale) ? (maybeLocale as Locale) : null;

	// Determine the target locale
	let targetLocale: Locale;

	if (event.locals.user?.preferredLanguage) {
		// Use user's preferred language if they have one
		const preferredLocale = preferredLanguageToLocale(event.locals.user.preferredLanguage);
		targetLocale = preferredLocale || baseLocale;
	} else {
		// Use base locale for anonymous users
		targetLocale = baseLocale;
	}

	// Check if we need to redirect
	if (currentLocale !== targetLocale) {
		const pathSegments = pathname.split("/").filter(Boolean);

		// If first segment is a locale, replace it; otherwise prepend target locale
		if (pathSegments[0] && locales.includes(pathSegments[0] as Locale)) {
			pathSegments[0] = targetLocale;
		} else {
			pathSegments.unshift(targetLocale);
		}

		const newPathname = "/" + pathSegments.join("/");
		const newUrl = `${newPathname}${event.url.search}`;
		redirect(302, newUrl);
	}

	// Root path without locale - let +page.server.ts handle it
	if (!maybeLocale) {
		return resolve(event);
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
};
