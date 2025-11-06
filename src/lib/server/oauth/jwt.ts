import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from "jose";

/**
 * OAuth JWT configuration
 */
const ISSUER = process.env.PUBLIC_URL || "http://localhost:5173";
const PRIVATE_KEY_PEM = process.env.OAUTH_PRIVATE_KEY || "";
const PUBLIC_KEY_PEM = process.env.OAUTH_PUBLIC_KEY || "";

// Cache imported keys
let privateKeyCache: CryptoKey | null = null;
let publicKeyCache: CryptoKey | null = null;

/**
 * Import private key from PEM format
 */
async function getPrivateKey(): Promise<CryptoKey> {
	if (privateKeyCache) {
		return privateKeyCache;
	}

	if (!PRIVATE_KEY_PEM) {
		throw new Error("OAUTH_PRIVATE_KEY environment variable not set");
	}

	privateKeyCache = await importPKCS8(PRIVATE_KEY_PEM, "RS256");
	return privateKeyCache;
}

/**
 * Import public key from PEM format
 */
async function getPublicKey(): Promise<CryptoKey> {
	if (publicKeyCache) {
		return publicKeyCache;
	}

	if (!PUBLIC_KEY_PEM) {
		throw new Error("OAUTH_PUBLIC_KEY environment variable not set");
	}

	publicKeyCache = await importSPKI(PUBLIC_KEY_PEM, "RS256");
	return publicKeyCache;
}

/**
 * User claims for JWT token
 */
export interface UserClaims {
	sub: string; // User ID
	email: string;
	name?: string;
	given_name?: string;
	family_name?: string;
	home_municipality?: string;
	is_admin: boolean;
	membership_status?: string;
	membership_type?: string;
	membership_expires?: string;
}

/**
 * Generate an access token (JWT) for a user
 */
export async function generateAccessToken(
	userId: string,
	clientId: string,
	claims: UserClaims,
): Promise<string> {
	const privateKey = await getPrivateKey();

	const jwt = await new SignJWT(claims)
		.setProtectedHeader({ alg: "RS256" })
		.setIssuedAt()
		.setIssuer(ISSUER)
		.setAudience(clientId)
		.setSubject(userId)
		.setExpirationTime("1h") // 1 hour
		.sign(privateKey);

	return jwt;
}

/**
 * Generate an ID token (JWT) for OpenID Connect
 * Similar to access token but with different purpose
 */
export async function generateIdToken(
	userId: string,
	clientId: string,
	claims: UserClaims,
): Promise<string> {
	const privateKey = await getPrivateKey();

	const jwt = await new SignJWT(claims)
		.setProtectedHeader({ alg: "RS256" })
		.setIssuedAt()
		.setIssuer(ISSUER)
		.setAudience(clientId)
		.setSubject(userId)
		.setExpirationTime("1h") // 1 hour
		.sign(privateKey);

	return jwt;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
	try {
		const publicKey = await getPublicKey();
		const { payload } = await jwtVerify(token, publicKey, {
			issuer: ISSUER,
		});
		return payload;
	} catch (error) {
		console.error("JWT verification failed:", error);
		return null;
	}
}

/**
 * Get the issuer URL for discovery documents
 */
export function getIssuer(): string {
	return ISSUER;
}
