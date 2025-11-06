import { json } from "@sveltejs/kit";
import { getIssuer } from "$lib/server/oauth/jwt";
import type { RequestHandler } from "./$types";

/**
 * OpenID Connect Discovery Document
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 *
 * This endpoint provides metadata about the OAuth/OIDC provider
 * Clients can use this to automatically discover endpoints and capabilities
 */
export const GET: RequestHandler = async () => {
	const issuer = getIssuer();

	const discoveryDocument = {
		issuer,
		authorization_endpoint: `${issuer}/oauth/authorize`,
		token_endpoint: `${issuer}/oauth/token`,
		userinfo_endpoint: `${issuer}/oauth/userinfo`,
		jwks_uri: `${issuer}/.well-known/jwks.json`,

		// Supported response types
		response_types_supported: ["code"],

		// Supported grant types
		grant_types_supported: ["authorization_code", "refresh_token"],

		// Supported subject types
		subject_types_supported: ["public"],

		// Supported ID token signing algorithms
		id_token_signing_alg_values_supported: ["RS256"],

		// Supported scopes
		scopes_supported: ["openid", "profile", "email"],

		// Supported claims
		claims_supported: [
			"sub",
			"email",
			"name",
			"given_name",
			"family_name",
			"home_municipality",
			"is_admin",
			"membership_status",
			"membership_type",
			"membership_expires",
		],

		// Token endpoint auth methods
		token_endpoint_auth_methods_supported: ["client_secret_post"],

		// Additional features
		code_challenge_methods_supported: [], // PKCE not yet implemented

		// Service documentation
		service_documentation: `${issuer}/docs/oauth`,
	};

	return json(discoveryDocument, {
		headers: {
			"Cache-Control": "public, max-age=3600", // Cache for 1 hour
		},
	});
};
