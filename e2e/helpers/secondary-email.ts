import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as table from "../../src/lib/server/db/schema";

/**
 * Test helper: Create a secondary email record directly via database
 *
 * This is a test-only version of createSecondaryEmail that doesn't depend
 * on SvelteKit's $env imports, making it safe to use in Playwright tests.
 */
export async function createSecondaryEmail(
	db: DrizzleD1Database<typeof table>,
	userId: string,
	email: string,
	options: {
		verified?: boolean;
		expiresAt?: Date | null;
	} = {},
): Promise<table.SecondaryEmail> {
	const normalizedEmail = email.toLowerCase();
	const domain = normalizedEmail.split("@")[1];
	if (!domain) throw new Error("Invalid email format");

	const secondaryEmail: table.SecondaryEmail = {
		id: crypto.randomUUID(),
		userId,
		email: normalizedEmail,
		domain,
		verifiedAt: options.verified ? new Date() : null,
		expiresAt: options.expiresAt ?? null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	await db.insert(table.secondaryEmail).values(secondaryEmail);

	return secondaryEmail;
}

/**
 * Test helper: Create a verified secondary email
 */
export async function createVerifiedSecondaryEmail(
	db: DrizzleD1Database<typeof table>,
	userId: string,
	email: string,
): Promise<table.SecondaryEmail> {
	return createSecondaryEmail(db, userId, email, { verified: true });
}

/**
 * Test helper: Create an unverified secondary email
 */
export async function createUnverifiedSecondaryEmail(
	db: DrizzleD1Database<typeof table>,
	userId: string,
	email: string,
): Promise<table.SecondaryEmail> {
	return createSecondaryEmail(db, userId, email, { verified: false });
}
