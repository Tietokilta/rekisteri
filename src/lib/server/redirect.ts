import { route } from "$lib/ROUTES";
import type { Locale } from "$lib/i18n/routing";

/**
 * Allowed internal paths that can be used as redirect targets.
 * This whitelist approach prevents open redirect vulnerabilities.
 */
const ALLOWED_RETURN_PATHS = [
	"/new", // Membership purchase page
] as const;

/**
 * Validates and returns a safe redirect URL from a returnTo query parameter.
 * Uses a strict whitelist of allowed paths to prevent open redirect attacks.
 *
 * @param returnTo - The returnTo query parameter value (path without locale)
 * @param locale - The current locale to prepend to the path
 * @param fallbackRoute - The fallback route key if returnTo is invalid
 * @returns A safe redirect URL
 */
export function getSafeRedirectUrl(
	returnTo: string | null | undefined,
	locale: Locale,
	fallbackRoute: "/[locale=locale]/settings/emails" = "/[locale=locale]/settings/emails",
): string {
	if (!returnTo) {
		return route(fallbackRoute, { locale });
	}

	// Extract just the pathname (strip query params for validation)
	const pathOnly = returnTo.split("?")[0];

	// Check if the path is in our allowed list
	if (!ALLOWED_RETURN_PATHS.includes(pathOnly as (typeof ALLOWED_RETURN_PATHS)[number])) {
		return route(fallbackRoute, { locale });
	}

	// Reconstruct the full URL with locale prefix
	// The returnTo should be stored without locale, so we add it back
	const queryString = returnTo.includes("?") ? returnTo.slice(returnTo.indexOf("?")) : "";

	return `/${locale}${pathOnly}${queryString}`;
}

/**
 * Cookie name for storing the return URL during email verification flow.
 * Using a cookie ensures the returnTo survives the add -> verify flow.
 */
export const returnToCookieName = "return_to";

/**
 * Cookie options for the returnTo cookie.
 */
export function getReturnToCookieOptions(dev: boolean) {
	return {
		maxAge: 60 * 30, // 30 minutes - enough time for email verification
		path: "/",
		httpOnly: true,
		secure: !dev,
		sameSite: "lax" as const,
	};
}
