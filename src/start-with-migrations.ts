#!/usr/bin/env node
/**
 * Production startup script that runs database migrations before starting the server
 * This is the entry point used by the Nix package
 *
 * NOTE: This is ESM JavaScript that will be copied directly to the build output.
 * Migrations run inline to avoid import path issues with the bundled server code.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "node:http";
import { oidcMiddleware } from "./oidc-mount.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations(databaseUrl: string) {
  console.log("Starting database migrations...");

  const migrationClient = postgres(databaseUrl, {
    max: 1,
    ssl: "prefer", // Prefer SSL (required for Azure), but allow non-SSL for CI/local
  });
  const db = drizzle({ client: migrationClient });

  // The drizzle folder is at the same level as this script
  const migrationsFolder = path.join(__dirname, "drizzle");

  try {
    await migrate(db, { migrationsFolder });
    console.log("✓ Database migrations completed successfully");
  } catch (error) {
    console.error("✗ Database migration failed:", error);
    throw error;
  } finally {
    await migrationClient.end();
  }
}

// Get DATABASE_URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is not set");
  process.exit(1);
}

try {
  // Run migrations before starting the server
  await runMigrations(databaseUrl);

  // Start our own HTTP server instead of adapter-node's index.js so OIDC protocol requests can be
  // routed to oidc-provider (which needs Node req/res) before SvelteKit. Importing handler.js also
  // initializes the SvelteKit app, which creates the provider when OIDC is enabled.
  // The server build is in the 'server' subdirectory
  // @ts-expect-error - server/handler.js is generated at build time by SvelteKit and doesn't exist during type checking
  const { handler } = await import("./server/handler.js");
  const httpServer = createServer((req, res) => oidcMiddleware(req, res, () => handler(req, res)));

  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, host, () => console.log(`Listening on http://${host}:${port}`));

  const shutdown = () => {
    httpServer.closeIdleConnections();
    httpServer.close(() => process.exit(0));
    setTimeout(() => httpServer.closeAllConnections(), 30_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} catch (error) {
  console.error("Failed to start application:", error);
  process.exit(1);
}
