import { dev } from "$app/environment";

/**
 * Cookie name for storing the return URL during email verification flow
 */
export const returnToCookieName = "email_verification_return_to";

/**
 * Allowed paths for redirect after email verification.
 * Only paths in this list (or starting with these prefixes) are allowed.
 * This prevents open redirect vulnerabilities.
 */
const ALLOWED_REDIRECT_PREFIXES = ["/fi/", "/en/"];

/**
 * Validates and sanitizes a return URL to prevent open redirect attacks.
 *
 * Security measures:
 * - Only allows relative paths (must start with /)
 * - Blocks protocol-relative URLs (//example.com)
 * - Validates against allowlist of path prefixes
 * - Prevents URL encoding tricks
 *
 * @param url - The URL to validate
 * @returns The validated URL if safe, null otherwise
 */
export function validateReturnUrl(url: string | null | undefined): string | null {
	if (!url || typeof url !== "string") {
		return null;
	}

	// Decode URL to catch encoding tricks
	let decodedUrl: string;
	try {
		decodedUrl = decodeURIComponent(url);
	} catch {
		// Invalid URL encoding
		return null;
	}

	// Must start with exactly one forward slash (not protocol-relative //)
	if (!decodedUrl.startsWith("/") || decodedUrl.startsWith("//")) {
		return null;
	}

	// Check for protocol in the URL (e.g., javascript:, data:, etc.)
	if (/^\/[^/]*:/i.test(decodedUrl)) {
		return null;
	}

	// Check against allowed prefixes
	const isAllowed = ALLOWED_REDIRECT_PREFIXES.some((prefix) => decodedUrl.startsWith(prefix));
	if (!isAllowed) {
		return null;
	}

	// Return the original (not decoded) URL to preserve query params
	return url;
}

/**
 * Sets the return URL cookie for the email verification flow.
 */
export function setReturnToCookie(
	cookies: {
		set: (
			name: string,
			value: string,
			opts: { path: string; maxAge: number; httpOnly: boolean; secure: boolean; sameSite: "lax" | "strict" | "none" },
		) => void;
	},
	returnTo: string,
): void {
	cookies.set(returnToCookieName, returnTo, {
		path: "/",
		maxAge: 60 * 15, // 15 minutes (same as OTP expiry)
		httpOnly: true,
		secure: !dev,
		sameSite: "lax",
	});
}

/**
 * Gets and validates the return URL from cookies, then deletes the cookie.
 */
export function getAndDeleteReturnToCookie(cookies: {
	get: (name: string) => string | undefined;
	delete: (name: string, opts: { path: string }) => void;
}): string | null {
	const returnTo = cookies.get(returnToCookieName);
	if (returnTo) {
		cookies.delete(returnToCookieName, { path: "/" });
	}
	return validateReturnUrl(returnTo);
}
