import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session.js";
import { getLocaleFromPathname } from "$lib/i18n/routing";
import { dev } from "$app/environment";

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

export const handle: Handle = sequence(handleAuth, handleSecurityHeaders, handleI18n);
