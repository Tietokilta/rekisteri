import { test as base, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

export type UserInfo = {
	id: string;
	email: string;
	isAdmin: boolean;
};

type AuthFixtures = {
	authenticatedPage: Page;
	adminPage: Page;
	adminUser: UserInfo;
};

/**
 * Extended test fixture with authenticated page contexts using storage state
 */
export const test = base.extend<AuthFixtures>({
	/**
	 * Creates an authenticated page with a regular user session
	 * Uses the admin storage state for now
	 */
	authenticatedPage: async ({ browser }, use) => {
		const storageStatePath = path.join(process.cwd(), "e2e/.auth/admin.json");
		const context = await browser.newContext({
			storageState: storageStatePath,
		});
		const page = await context.newPage();

		await use(page);

		await context.close();
	},

	/**
	 * Creates an authenticated page with an admin user session
	 * Uses the pre-created admin storage state from global setup
	 */
	adminPage: async ({ browser }, use) => {
		const storageStatePath = path.join(process.cwd(), "e2e/.auth/admin.json");
		const context = await browser.newContext({
			storageState: storageStatePath,
		});
		const page = await context.newPage();

		await use(page);

		await context.close();
	},

	/**
	 * Provides info about the admin user (id, email, isAdmin)
	 * Read from file created by global setup
	 */
	// eslint-disable-next-line no-empty-pattern -- required for playwright fixture
	adminUser: async ({}, use) => {
		const userInfoPath = path.join(process.cwd(), "e2e/.auth/admin-user.json");
		const userInfo = JSON.parse(fs.readFileSync(userInfoPath, "utf8")) as UserInfo;
		await use(userInfo);
	},
});

export { expect } from "@playwright/test";
