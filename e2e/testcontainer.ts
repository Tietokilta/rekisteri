import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import fs from "node:fs";
import * as table from "../src/lib/server/db/schema";

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  client: ReturnType<typeof postgres>;
  db: PostgresJsDatabase<typeof table>;
  connectionUri: string;
};

const STATE_FILE_PATH = path.join(process.cwd(), "e2e/.testcontainer-state.json");

type ContainerState = {
  containerId: string;
  connectionUri: string;
};

/**
 * Creates a PostgreSQL test container and runs migrations.
 * Use in global-setup and clean up with stopTestDatabase in global-teardown.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  console.log("✓ Starting PostgreSQL test container...");
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const connectionUri = container.getConnectionUri();

  // Run migrations programmatically
  console.log("✓ Running migrations...");
  const migrationClient = postgres(connectionUri, { max: 1 });
  const migrationDb = drizzle(migrationClient, { casing: "snake_case" });
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  await migrate(migrationDb, { migrationsFolder });
  await migrationClient.end();

  // Create the main connection
  const client = postgres(connectionUri);
  const db = drizzle(client, { schema: table, casing: "snake_case" });

  return { container, client, db, connectionUri };
}

/**
 * Saves container state to a file for retrieval in global-teardown and fixtures.
 */
export function saveContainerState(containerId: string, connectionUri: string): void {
  const state: ContainerState = { containerId, connectionUri };
  // Ensure .testcontainer-state.json is in .gitignore
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Loads container state from file.
 */
export function loadContainerState(): ContainerState | null {
  try {
    const content = fs.readFileSync(STATE_FILE_PATH, "utf8");
    return JSON.parse(content) as ContainerState;
  } catch {
    return null;
  }
}

/**
 * Gets the database URL from the container state file.
 * Throws an error if the state file doesn't exist.
 */
export function getDatabaseUrl(): string {
  const state = loadContainerState();
  if (!state) {
    throw new Error("Container state file not found. Make sure global-setup has run.");
  }
  return state.connectionUri;
}

/**
 * Cleans up the container state file.
 */
export function cleanupContainerState(): void {
  try {
    fs.unlinkSync(STATE_FILE_PATH);
  } catch {
    // File might not exist, that's ok
  }
}

/**
 * Stops the test database container and closes connections.
 */
export async function stopTestDatabase(testDb: TestDatabase): Promise<void> {
  await testDb.client.end();
  await testDb.container.stop();
  cleanupContainerState();
}
