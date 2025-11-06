import { json } from "@sveltejs/kit";
import { exportSPKI, importSPKI } from "jose";
import type { RequestHandler } from "./$types";

/**
 * JSON Web Key Set (JWKS) Endpoint
 * https://datatracker.ietf.org/doc/html/rfc7517
 *
 * Provides the public keys used to verify JWT signatures
 * Clients use this to validate access tokens and ID tokens
 */
export const GET: RequestHandler = async () => {
	const publicKeyPem = process.env.OAUTH_PUBLIC_KEY;

	if (!publicKeyPem) {
		return json(
			{ error: "OAUTH_PUBLIC_KEY not configured" },
			{ status: 500 },
		);
	}

	try {
		// Import the public key
		const publicKey = await importSPKI(publicKeyPem, "RS256");

		// Export as JWK (JSON Web Key)
		const jwk = await crypto.subtle.exportKey("jwk", publicKey);

		// Add required fields for JWKS
		const jwks = {
			keys: [
				{
					...jwk,
					kid: "rekisteri-2025", // Key ID (can be versioned for key rotation)
					alg: "RS256",
					use: "sig", // Signature verification
				},
			],
		};

		return json(jwks, {
			headers: {
				"Cache-Control": "public, max-age=86400", // Cache for 24 hours
			},
		});
	} catch (error) {
		console.error("Failed to export JWKS:", error);
		return json(
			{ error: "Failed to generate JWKS" },
			{ status: 500 },
		);
	}
};
