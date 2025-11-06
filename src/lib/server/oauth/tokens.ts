import { randomBytes } from "@oslojs/crypto/random";
import { encodeBase64urlNoPadding } from "@oslojs/encoding";
import { db } from "$lib/server/db";
import * as schema from "$lib/server/db/schema";
import { eq, and, lt } from "drizzle-orm";

/**
 * Generate a secure random authorization code
 */
export function generateAuthorizationCode(): string {
	const bytes = randomBytes(32); // 256 bits
	return encodeBase64urlNoPadding(bytes);
}

/**
 * Generate a secure random refresh token
 */
export function generateRefreshToken(): string {
	const bytes = randomBytes(32); // 256 bits
	return encodeBase64urlNoPadding(bytes);
}

/**
 * Create an authorization code in the database
 */
export async function createAuthorizationCode(params: {
	userId: string;
	clientId: string;
	redirectUri: string;
}): Promise<string> {
	const code = generateAuthorizationCode();
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

	await db.insert(schema.oauthAuthorizationCode).values({
		code,
		userId: params.userId,
		clientId: params.clientId,
		redirectUri: params.redirectUri,
		expiresAt,
		createdAt: new Date(),
	});

	return code;
}

/**
 * Validate and consume an authorization code
 * Returns the code data if valid, null if invalid
 * Authorization codes are single-use and will be deleted after validation
 */
export async function validateAuthorizationCode(
	code: string,
	clientId: string,
	redirectUri: string,
): Promise<schema.OAuthAuthorizationCode | null> {
	const authCode = await db.query.oauthAuthorizationCode.findFirst({
		where: eq(schema.oauthAuthorizationCode.code, code),
	});

	if (!authCode) {
		return null;
	}

	// Validate client ID
	if (authCode.clientId !== clientId) {
		return null;
	}

	// Validate redirect URI (must match exactly)
	if (authCode.redirectUri !== redirectUri) {
		return null;
	}

	// Check expiration
	if (authCode.expiresAt < new Date()) {
		// Delete expired code
		await db
			.delete(schema.oauthAuthorizationCode)
			.where(eq(schema.oauthAuthorizationCode.code, code));
		return null;
	}

	// Delete code (single-use)
	await db
		.delete(schema.oauthAuthorizationCode)
		.where(eq(schema.oauthAuthorizationCode.code, code));

	return authCode;
}

/**
 * Create a refresh token in the database
 */
export async function createRefreshToken(params: {
	userId: string;
	clientId: string;
}): Promise<string> {
	const token = generateRefreshToken();
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

	await db.insert(schema.oauthToken).values({
		token,
		type: "refresh",
		userId: params.userId,
		clientId: params.clientId,
		expiresAt,
		createdAt: new Date(),
	});

	return token;
}

/**
 * Validate a refresh token
 * Returns the token data if valid, null if invalid
 */
export async function validateRefreshToken(
	token: string,
	clientId: string,
): Promise<schema.OAuthToken | null> {
	const refreshToken = await db.query.oauthToken.findFirst({
		where: and(
			eq(schema.oauthToken.token, token),
			eq(schema.oauthToken.type, "refresh"),
			eq(schema.oauthToken.clientId, clientId),
		),
	});

	if (!refreshToken) {
		return null;
	}

	// Check expiration
	if (refreshToken.expiresAt < new Date()) {
		// Delete expired token
		await db.delete(schema.oauthToken).where(eq(schema.oauthToken.token, token));
		return null;
	}

	return refreshToken;
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
	const result = await db.delete(schema.oauthToken).where(eq(schema.oauthToken.token, token));
	return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Cleanup expired authorization codes and tokens
 * Should be called periodically (e.g., via cron job)
 */
export async function cleanupExpiredOAuthTokens(): Promise<void> {
	const now = new Date();

	// Delete expired authorization codes
	await db.delete(schema.oauthAuthorizationCode).where(lt(schema.oauthAuthorizationCode.expiresAt, now));

	// Delete expired tokens
	await db.delete(schema.oauthToken).where(lt(schema.oauthToken.expiresAt, now));
}
