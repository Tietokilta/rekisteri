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
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations(databaseUrl: string) {
	console.log("Starting database migrations...");

	const migrationClient = postgres(databaseUrl, { max: 1 });
	const db = drizzle(migrationClient, { casing: "snake_case" });

	// The drizzle folder is at the same level as this script
	const migrationsFolder = join(__dirname, "drizzle");

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

async function start() {
	// Get DATABASE_URL from environment
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		console.error("Error: DATABASE_URL environment variable is not set");
		process.exit(1);
	}

	try {
		// Run migrations before starting the server
		await runMigrations(databaseUrl);

		// Import and start the server
		// The server build is in the 'server' subdirectory
		// @ts-expect-error - server/index.js is generated at build time by SvelteKit and doesn't exist during type checking
		await import("./server/index.js");
	} catch (error) {
		console.error("Failed to start application:", error);
		process.exit(1);
	}
}

start();
