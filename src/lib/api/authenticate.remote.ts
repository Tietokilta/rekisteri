import { error } from "@sveltejs/kit";
import { getRequestEvent, command } from "$app/server";
import { createAuthenticationOptions, verifyAuthenticationAndGetUser } from "$lib/server/auth/passkey";
import { createSession, generateSessionToken, sessionCookieName } from "$lib/server/auth/session";
import { createAuditLog } from "$lib/server/audit";
import { emailCookieName as signInEmailCookieName } from "$lib/server/auth/email";
import { RefillingTokenBucket } from "$lib/server/auth/rate-limit";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { dev } from "$app/environment";
import * as v from "valibot";

// Rate limit: 10 authentication attempts per hour per email
const authBucket = new RefillingTokenBucket<string>(10, 60 * 60);

const challengeCookieName = "passkey_auth_challenge";
const emailCookieName = "passkey_auth_email";

/**
 * Generate passkey authentication options
 */
export const getAuthenticationOptions = command(
	v.pipe(v.string(), v.email()),
	async (email): Promise<{ options: PublicKeyCredentialRequestOptionsJSON }> => {
		const { cookies } = getRequestEvent();

		// Rate limiting by email
		if (!authBucket.consume(email, 1)) {
			throw error(429, "Too many authentication attempts. Please try again later.");
		}

		try {
			const options = await createAuthenticationOptions(email);

			// Store challenge and email in cookies for verification
			cookies.set(challengeCookieName, options.challenge, {
				path: "/",
				httpOnly: true,
				secure: !dev,
				sameSite: "strict",
				maxAge: 60 * 5, // 5 minutes
			});

			cookies.set(emailCookieName, email, {
				path: "/",
				httpOnly: true,
				secure: !dev,
				sameSite: "strict",
				maxAge: 60 * 5, // 5 minutes
			});

			return { options };
		} catch (err) {
			console.error("Failed to generate authentication options:", err);
			throw error(500, "Failed to generate authentication options");
		}
	},
);

/**
 * Verify passkey authentication and create session
 */
export const verifyAuthentication = command(
	v.any(), // AuthenticationResponseJSON from SimpleWebAuthn
	async (response): Promise<{ success: boolean; user: { id: string; email: string; isAdmin: boolean } }> => {
		const { cookies, request, getClientAddress } = getRequestEvent();

		const challenge = cookies.get(challengeCookieName);
		const email = cookies.get(emailCookieName);

		if (!challenge || !email) {
			throw error(400, "No authentication challenge found. Please start authentication again.");
		}

		try {
			const result = await verifyAuthenticationAndGetUser(response, challenge, email);

			if (!result) {
				// Clear cookies on failed authentication
				cookies.delete(challengeCookieName, { path: "/" });
				cookies.delete(emailCookieName, { path: "/" });
				cookies.delete(signInEmailCookieName, { path: "/" });
				throw error(401, "Authentication failed");
			}

			const { user, passkey } = result;

			// Create session
			const sessionToken = generateSessionToken();
			const session = await createSession(sessionToken, user.id);
			cookies.set(sessionCookieName, sessionToken, {
				expires: session.expiresAt,
				path: "/",
				httpOnly: true,
				secure: !dev,
				sameSite: "lax",
			});

			// Log successful login
			const clientAddress = getClientAddress();
			const userAgent = request.headers.get("user-agent") || undefined;
			await createAuditLog({
				userId: user.id,
				action: "auth.login",
				targetType: "user",
				targetId: user.id,
				metadata: {
					method: "passkey",
					passkeyId: passkey.id,
					deviceName: passkey.deviceName,
				},
				ipAddress: clientAddress,
				userAgent,
			});

			// Clear challenge cookies and sign-in email cookie
			cookies.delete(challengeCookieName, { path: "/" });
			cookies.delete(emailCookieName, { path: "/" });
			cookies.delete(signInEmailCookieName, { path: "/" });

			return {
				success: true,
				user: {
					id: user.id,
					email: user.email,
					isAdmin: user.isAdmin,
				},
			};
		} catch (err) {
			console.error("Failed to verify passkey authentication:", err);
			// Clear cookies on error
			cookies.delete(challengeCookieName, { path: "/" });
			cookies.delete(emailCookieName, { path: "/" });
			cookies.delete(signInEmailCookieName, { path: "/" });

			// Re-throw HttpErrors (intentional errors like 401, 400) as-is
			if (err && typeof err === "object" && "status" in err) {
				throw err;
			}

			// Only unexpected errors become 500
			throw error(500, "Failed to verify authentication");
		}
	},
);
