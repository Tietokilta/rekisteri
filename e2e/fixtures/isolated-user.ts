import { test as dbTest } from "./db";
import type { Page, BrowserContext } from "@playwright/test";
import * as table from "../../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { generateUserId } from "../../src/lib/server/auth/utils";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";

export type IsolatedUser = {
	id: string;
	email: string;
};

type IsolatedUserFixtures = {
	/**
	 * A unique user created for this test only.
	 * Automatically cleaned up after the test.
	 */
	isolatedUser: IsolatedUser;

	/**
	 * Browser context authenticated as the isolated user.
	 * Use this to create pages that are logged in as the test user.
	 */
	isolatedContext: BrowserContext;

	/**
	 * Page authenticated as the isolated user.
	 * Ready to use - no login required.
	 */
	isolatedPage: Page;
};

/**
 * Extended test fixture with isolated user support.
 *
 * Each test gets its own unique user, session, and authenticated page.
 * This enables full parallel execution without test interference.
 *
 * @example
 * ```ts
 * import { test, expect } from "./fixtures/isolated-user";
 *
 * test("my isolated test", async ({ isolatedPage, isolatedUser, db }) => {
 *   // isolatedPage is already authenticated as isolatedUser
 *   await isolatedPage.goto("/fi/some-page");
 *
 *   // Create test data linked to the isolated user
 *   await db.insert(table.member).values({
 *     id: crypto.randomUUID(),
 *     userId: isolatedUser.id,
 *     membershipId: someMembershipId,
 *     status: "active",
 *   });
 *
 *   // Test assertions...
 * });
 * ```
 */
export const test = dbTest.extend<IsolatedUserFixtures>({
	isolatedUser: async ({ db }, use, testInfo) => {
		// Create a unique user for this test
		const userId = generateUserId();
		const email = `test-isolated-${testInfo.workerIndex}-${crypto.randomUUID()}@example.com`;

		await db.insert(table.user).values({
			id: userId,
			email,
			firstNames: "Test",
			lastName: "User",
			homeMunicipality: "Helsinki",
			preferredLanguage: "unspecified",
			isAllowedEmails: false,
			isAdmin: false,
		});

		await use({ id: userId, email });

		// Cleanup: delete user's data in correct order (foreign key constraints)
		await db.delete(table.member).where(eq(table.member.userId, userId));
		await db.delete(table.session).where(eq(table.session.userId, userId));
		await db.delete(table.user).where(eq(table.user.id, userId));
	},

	isolatedContext: async ({ browser, db, isolatedUser }, use) => {
		// Create a session for the isolated user
		const sessionToken = encodeBase64url(crypto.getRandomValues(new Uint8Array(18)));
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)));
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day

		await db.insert(table.session).values({
			id: sessionId,
			userId: isolatedUser.id,
			expiresAt,
		});

		// Create browser context with auth cookie
		const context = await browser.newContext();
		await context.addCookies([
			{
				name: "auth-session",
				value: sessionToken,
				domain: "localhost",
				path: "/",
				expires: Math.floor(expiresAt.getTime() / 1000),
				httpOnly: false,
				secure: false,
				sameSite: "Lax",
			},
		]);

		await use(context);

		await context.close();
	},

	isolatedPage: async ({ isolatedContext }, use) => {
		const page = await isolatedContext.newPage();
		await use(page);
	},
});

export { expect } from "@playwright/test";
