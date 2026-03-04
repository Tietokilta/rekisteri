import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "pnpm tsx e2e/start-server.ts",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    // Longer timeout for container startup + build
    timeout: 180_000,
  },

  testDir: "e2e",

  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  // Longer timeout for global setup (testcontainer startup + migrations + seeding)
  globalTimeout: process.env.CI ? 300_000 : 180_000,

  use: {
    baseURL: "http://localhost:4173",
    locale: "fi-FI",
    timezoneId: "Europe/Helsinki",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "html" : "list",

  // Longer timeout for tests since container startup can be slow
  timeout: 60_000,

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
