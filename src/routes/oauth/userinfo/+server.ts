import { json } from "@sveltejs/kit";
import { verifyAccessToken } from "$lib/server/oauth/jwt";
import { createUserClaims } from "$lib/server/oauth/claims";
import { logAudit } from "$lib/server/audit";
import type { RequestHandler } from "./$types";

/**
 * OAuth 2.0 UserInfo Endpoint (OpenID Connect)
 * Returns user information based on a valid access token
 *
 * Expected header:
 * Authorization: Bearer <access_token>
 */
export const GET: RequestHandler = async (event) => {
	// Extract Bearer token from Authorization header
	const authHeader = event.request.headers.get("Authorization");

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return json({ error: "invalid_request", error_description: "Missing or invalid Authorization header" }, {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Bearer realm="rekisteri"',
			},
		});
	}

	const token = authHeader.slice(7); // Remove "Bearer " prefix

	// Verify JWT token
	const payload = await verifyAccessToken(token);

	if (!payload || !payload.sub) {
		return json({ error: "invalid_token", error_description: "Invalid or expired access token" }, {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Bearer realm="rekisteri", error="invalid_token"',
			},
		});
	}

	// Get fresh user claims
	try {
		const claims = await createUserClaims(payload.sub);

		// Log userinfo access
		await logAudit({
			userId: payload.sub,
			action: "oauth.userinfo_accessed",
			targetType: "oauth_client",
			targetId: payload.aud?.toString() || "unknown",
			metadata: {},
			event,
		});

		// Return user information
		return json(claims);
	} catch (error) {
		console.error("Failed to get user claims:", error);
		return json(
			{ error: "server_error", error_description: "Failed to retrieve user information" },
			{ status: 500 },
		);
	}
};
