import { sequence } from "@sveltejs/kit/hooks";
import type { Handle, ServerInit } from "@sveltejs/kit";
import * as auth from "$lib/server/auth/session.js";
import { getLocaleFromPathname } from "$lib/i18n/routing";
import { runMigrations } from "$lib/server/db/migrate.js";
import { env } from "$env/dynamic/private";

export const migrateDatabase: ServerInit = async () => {
	if (env.DATABASE_URL) {
		try {
			await runMigrations(env.DATABASE_URL);
		} catch (error) {
			console.error("Failed to run database migrations:", error);
			process.exit(1);
		}
	}
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

const handleI18n: Handle = ({ event, resolve }) => {
	const locale = getLocaleFromPathname(event.url.pathname);

	return resolve(event, {
		transformPageChunk: ({ html }) => {
			return html.replace("%lang%", locale);
		},
	});
};

export const handle: Handle = sequence(handleAuth, handleI18n);
