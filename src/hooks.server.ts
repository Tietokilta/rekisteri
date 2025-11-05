import { sequence } from "@sveltejs/kit/hooks";
import type { Handle, ServerInit } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session.js";
import { getLocaleFromPathname } from "$lib/i18n/routing";
import { dev } from "$app/environment";
import cron from "node-cron";
import { cleanupExpiredTokens, cleanupOldAuditLogs } from "$lib/server/db/cleanup";
import { cleanupExpiredTokens } from "$lib/server/db/cleanup";

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

const handleI18n: Handle = ({ event, resolve }) => {
	const locale = getLocaleFromPathname(event.url.pathname);

	return resolve(event, {
		transformPageChunk: ({ html }) => {
			return html.replace("%lang%", locale);
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

export const handle: Handle = sequence(handleAuth, handleAdminAuthorization, handleSecurityHeaders, handleI18n);

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
