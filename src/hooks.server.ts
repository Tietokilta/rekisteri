import { sequence } from "@sveltejs/kit/hooks";
import { i18n } from "$lib/i18n";
import type { Handle } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session.js";

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

const handleParaglide: Handle = async ({ event, resolve }) => {
	// Ignore for API paths
	if (event.url.pathname.startsWith("/api")) {
		return resolve(event);
	}
	return i18n.handle()({ event, resolve });
};
export const handle: Handle = sequence(handleAuth, handleParaglide);
