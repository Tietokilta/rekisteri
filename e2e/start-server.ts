/**
 * Script to start the preview server for e2e tests.
 * Reads the database URL from the testcontainer state file.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getDatabaseUrl } from "./testcontainer";
import { loadEnvFile } from "./utils";

const STATE_FILE_PATH = path.join(process.cwd(), "e2e/.testcontainer-state.json");

// Wait for the state file to be created by globalSetup
async function waitForStateFile(maxWaitMs: number = 120_000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 1000;

  console.log("✓ WebServer: Waiting for globalSetup to complete...");

  while (Date.now() - startTime < maxWaitMs) {
    if (existsSync(STATE_FILE_PATH)) {
      console.log("✓ WebServer: State file found, globalSetup completed");
      return;
    }
    console.log(`  WebServer: State file not found, waiting... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timed out waiting for state file after ${maxWaitMs / 1000}s. ` +
      `GlobalSetup may have failed or not run. Check CI logs for globalSetup output.`,
  );
}

// Load other env vars from .env (STRIPE_API_KEY, etc.)
loadEnvFile();

// Wait for globalSetup to create the state file
await waitForStateFile();

// Get database URL from testcontainer state
const databaseUrl = getDatabaseUrl();

console.log("✓ Starting server with test database...");

// Build the app first
execSync("pnpm build", {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
});

// Start the preview server
const server = spawn("pnpm", ["preview"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    UNSAFE_DISABLE_RATE_LIMITS: "true",
    TEST: "true",
    // WebAuthn/Passkey configuration for test environment
    RP_ORIGIN: "http://localhost:4173",
    RP_ID: "localhost",
    RP_NAME: "Tietokilta Rekisteri",
  },
});

server.on("error", (error) => {
  throw new Error(`Failed to start server: ${error.message}`);
});

// Handle termination
process.on("SIGTERM", () => {
  server.kill("SIGTERM");
});

process.on("SIGINT", () => {
  server.kill("SIGINT");
});
