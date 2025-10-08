import { test as base, type Page } from "@playwright/test";
import path from "node:path";

type AuthFixtures = {
	authenticatedPage: Page;
	adminPage: Page;
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
});

export { expect } from "@playwright/test";
