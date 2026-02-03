/**
 * Script to start the preview server for e2e tests.
 * Reads the database URL from the testcontainer state file.
 */
import { spawn, execSync } from "node:child_process";
import { getDatabaseUrl } from "./testcontainer";
import { loadEnvFile } from "./utils";

// Load other env vars from .env (STRIPE_API_KEY, etc.)
loadEnvFile();

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
