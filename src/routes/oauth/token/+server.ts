import { json } from "@sveltejs/kit";
import { validateOAuthClient } from "$lib/server/oauth/config";
import {
	validateAuthorizationCode,
	createRefreshToken,
	validateRefreshToken,
} from "$lib/server/oauth/tokens";
import { generateAccessToken, generateIdToken } from "$lib/server/oauth/jwt";
import { createUserClaims } from "$lib/server/oauth/claims";
import { logAudit } from "$lib/server/audit";
import type { RequestHandler } from "./$types";

/**
 * OAuth 2.0 Token Endpoint
 * Handles token exchange requests
 *
 * Supports two grant types:
 * 1. authorization_code: Exchange authorization code for tokens
 * 2. refresh_token: Exchange refresh token for new access token
 */
export const POST: RequestHandler = async (event) => {
	// Parse form data (OAuth 2.0 uses form-encoded, not JSON)
	const formData = await event.request.formData();

	const grantType = formData.get("grant_type");
	const clientId = formData.get("client_id");
	const clientSecret = formData.get("client_secret");

	// Validate client credentials
	if (!clientId || !clientSecret) {
		return json({ error: "invalid_client", error_description: "Missing client credentials" }, { status: 401 });
	}

	const client = validateOAuthClient(clientId.toString(), clientSecret.toString());
	if (!client) {
		return json({ error: "invalid_client", error_description: "Invalid client credentials" }, { status: 401 });
	}

	// Handle authorization code grant
	if (grantType === "authorization_code") {
		const code = formData.get("code");
		const redirectUri = formData.get("redirect_uri");

		if (!code || !redirectUri) {
			return json(
				{ error: "invalid_request", error_description: "Missing code or redirect_uri" },
				{ status: 400 },
			);
		}

		// Validate and consume authorization code
		const authCode = await validateAuthorizationCode(code.toString(), client.id, redirectUri.toString());

		if (!authCode) {
			return json(
				{ error: "invalid_grant", error_description: "Invalid or expired authorization code" },
				{ status: 400 },
			);
		}

		// Generate tokens
		const claims = await createUserClaims(authCode.userId);
		const accessToken = await generateAccessToken(authCode.userId, client.id, claims);
		const idToken = await generateIdToken(authCode.userId, client.id, claims);
		const refreshToken = await createRefreshToken({
			userId: authCode.userId,
			clientId: client.id,
		});

		// Log token issuance
		await logAudit({
			userId: authCode.userId,
			action: "oauth.token_issued",
			targetType: "oauth_client",
			targetId: client.id,
			metadata: { grantType: "authorization_code" },
			event,
		});

		return json({
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: 3600, // 1 hour
			refresh_token: refreshToken,
			id_token: idToken,
		});
	}

	// Handle refresh token grant
	if (grantType === "refresh_token") {
		const refreshTokenValue = formData.get("refresh_token");

		if (!refreshTokenValue) {
			return json(
				{ error: "invalid_request", error_description: "Missing refresh_token" },
				{ status: 400 },
			);
		}

		// Validate refresh token
		const tokenData = await validateRefreshToken(refreshTokenValue.toString(), client.id);

		if (!tokenData) {
			return json(
				{ error: "invalid_grant", error_description: "Invalid or expired refresh token" },
				{ status: 400 },
			);
		}

		// Generate new access token (but not a new refresh token)
		const claims = await createUserClaims(tokenData.userId);
		const accessToken = await generateAccessToken(tokenData.userId, client.id, claims);
		const idToken = await generateIdToken(tokenData.userId, client.id, claims);

		// Log token refresh
		await logAudit({
			userId: tokenData.userId,
			action: "oauth.token_refreshed",
			targetType: "oauth_client",
			targetId: client.id,
			metadata: { grantType: "refresh_token" },
			event,
		});

		return json({
			access_token: accessToken,
			token_type: "Bearer",
			expires_in: 3600, // 1 hour
			id_token: idToken,
		});
	}

	// Unsupported grant type
	return json(
		{ error: "unsupported_grant_type", error_description: `Grant type '${grantType}' is not supported` },
		{ status: 400 },
	);
};
