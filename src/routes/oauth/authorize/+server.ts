import { redirect } from "@sveltejs/kit";
import { findOAuthClient } from "$lib/server/oauth/config";
import { createAuthorizationCode } from "$lib/server/oauth/tokens";
import { route } from "$lib/ROUTES";
import { getLocaleFromPathname, localizePathname } from "$lib/i18n/routing";
import { logAudit } from "$lib/server/audit";
import type { RequestHandler } from "./$types";

/**
 * OAuth 2.0 Authorization Endpoint
 * Handles the first step of the authorization code flow
 *
 * Expected query parameters:
 * - response_type: Must be "code"
 * - client_id: OAuth client identifier
 * - redirect_uri: Where to redirect after authorization
 * - state: Optional state parameter for CSRF protection
 * - scope: Optional space-separated scopes (currently ignored, all clients get same scopes)
 */
export const GET: RequestHandler = async (event) => {
	const { url, locals, cookies } = event;
	const locale = getLocaleFromPathname(url.pathname);

	// Parse query parameters
	const clientId = url.searchParams.get("client_id");
	const redirectUri = url.searchParams.get("redirect_uri");
	const state = url.searchParams.get("state");
	const responseType = url.searchParams.get("response_type");

	// Validate required parameters
	if (!clientId || !redirectUri) {
		return new Response("Missing required parameters: client_id and redirect_uri", {
			status: 400,
		});
	}

	if (responseType !== "code") {
		return new Response("Invalid response_type. Only 'code' is supported.", {
			status: 400,
		});
	}

	// Validate client
	const client = findOAuthClient(clientId);
	if (!client) {
		return new Response("Invalid client_id", { status: 400 });
	}

	// Validate redirect URI (must be in client's allowed list)
	if (!client.redirectUris.includes(redirectUri)) {
		return new Response("Invalid redirect_uri for this client", { status: 400 });
	}

	// Check if user is authenticated
	if (!locals.user || !locals.session) {
		// Store the authorization request in a cookie so we can resume after login
		const returnUrl = url.pathname + url.search;
		redirect(302, localizePathname(route("/sign-in"), locale) + `?return=${encodeURIComponent(returnUrl)}`);
	}

	// User is authenticated - auto-approve (trusted client)
	// Generate authorization code
	const code = await createAuthorizationCode({
		userId: locals.user.id,
		clientId,
		redirectUri,
	});

	// Log successful authorization
	await logAudit({
		userId: locals.user.id,
		action: "oauth.authorize",
		targetType: "oauth_client",
		targetId: clientId,
		metadata: { redirectUri },
		event,
	});

	// Redirect back to client with authorization code
	const callbackUrl = new URL(redirectUri);
	callbackUrl.searchParams.set("code", code);
	if (state) {
		callbackUrl.searchParams.set("state", state);
	}

	redirect(302, callbackUrl.toString());
};
