import { defineConfig } from "@playwright/test";
import { loadEnvFile } from "./e2e/utils";

loadEnvFile();
const testDbUrl = process.env.DATABASE_URL_TEST;

if (!testDbUrl) {
	throw new Error("DATABASE_URL_TEST not found in environment. Make sure .env file exists.");
}

export default defineConfig({
	webServer: {
		command: "pnpm build && pnpm preview",
		port: 4173,
		reuseExistingServer: !process.env.CI,
		env: {
			DATABASE_URL: testDbUrl,
			UNSAFE_DISABLE_RATE_LIMITS: "true",
			TEST: "true",
		},
	},

	testDir: "e2e",

	globalSetup: "./e2e/global-setup.ts",

	use: {
		baseURL: "http://localhost:4173",
		locale: "fi-FI",
		timezoneId: "Europe/Helsinki",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "html" : "list",
});
