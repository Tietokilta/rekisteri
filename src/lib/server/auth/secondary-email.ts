import { eq } from "drizzle-orm";
import { db } from "../db";
import * as table from "../db/schema";
import type { SecondaryEmail, User } from "../db/schema";

/**
 * Domains that require periodic re-verification
 */
const EXPIRING_DOMAINS: Record<string, { months: number }> = {
	"aalto.fi": { months: 6 },
	// Add more domains as needed
};

/**
 * Calculate expiration date for a domain based on verification time
 * Returns null for domains that never expire
 */
export function calculateExpiry(domain: string, verifiedAt: Date): Date | null {
	const policy = EXPIRING_DOMAINS[domain.toLowerCase()];
	if (!policy) return null;

	const expiry = new Date(verifiedAt);
	expiry.setMonth(expiry.getMonth() + policy.months);
	return expiry;
}

/**
 * Check if a secondary email is currently valid
 * Valid means: verified AND not expired (if expiry is set)
 */
export function isSecondaryEmailValid(secondaryEmail: SecondaryEmail): boolean {
	// Not verified yet
	if (!secondaryEmail.verifiedAt) return false;

	// No expiry means it never expires
	if (!secondaryEmail.expiresAt) return true;

	// Check if expired
	return secondaryEmail.expiresAt > new Date();
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
	const parts = email.toLowerCase().split("@");
	if (parts.length !== 2) {
		throw new Error("Invalid email format");
	}
	return parts[1];
}

/**
 * Check if a user has a valid secondary email for a specific domain
 */
export function hasValidDomainEmail(
	secondaryEmails: SecondaryEmail[],
	domain: string,
): boolean {
	return secondaryEmails.some(
		(email) => email.domain.toLowerCase() === domain.toLowerCase() && isSecondaryEmailValid(email),
	);
}

/**
 * Find a user by email address, checking both primary and secondary emails
 * Email lookup is case-insensitive
 * Returns null if no user found with that email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
	const normalizedEmail = email.toLowerCase();

	// First check primary email
	const [userByPrimary] = await db
		.select()
		.from(table.user)
		.where(eq(table.user.email, normalizedEmail));

	if (userByPrimary) {
		return userByPrimary;
	}

	// Check secondary emails
	const [secondaryEmailRecord] = await db
		.select()
		.from(table.secondaryEmail)
		.where(eq(table.secondaryEmail.email, normalizedEmail));

	if (!secondaryEmailRecord) {
		return null;
	}

	// Get the user associated with this secondary email
	const [user] = await db
		.select()
		.from(table.user)
		.where(eq(table.user.id, secondaryEmailRecord.userId));

	return user ?? null;
}
