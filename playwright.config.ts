import { defineConfig } from "@playwright/test";
import { getFreePort, loadEnvFile } from "./e2e/utils";

loadEnvFile();

// Picked once in the main process. Workers re-evaluate this file but inherit the
// env var, so they agree on the port. Lets several worktrees run e2e at once.
process.env.E2E_PORT ??= String(await getFreePort());

export default defineConfig({
  // The app server and its database container are started in global setup
  testDir: "e2e",

  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: `http://localhost:${process.env.E2E_PORT}`,
    locale: "fi-FI",
    timezoneId: "Europe/Helsinki",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "html" : "list",

  // Configure projects to handle CDP-based tests (passkeys) that can't run in parallel
  projects: [
    {
      name: "default",
      testIgnore: /passkeys\.test\.ts$/,
    },
    {
      name: "passkeys",
      testMatch: /passkeys\.test\.ts$/,
      // CDP-based virtual authenticators require isolated execution
      // Run after default tests complete to prevent session conflicts
      dependencies: ["default"],
    },
  ],
});
