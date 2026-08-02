import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { relations } from "../../src/lib/server/db/relations";

type Schema = typeof relations;

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  client: ReturnType<typeof postgres>;
  db: PostgresJsDatabase<Schema>;
};

/**
 * Creates a PostgreSQL test container and runs migrations.
 * Use in beforeAll and clean up with stopTestDatabase in afterAll.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const connectionUri = container.getConnectionUri();

  // Run migrations programmatically
  const migrationClient = postgres(connectionUri, { max: 1 });
  const migrationDb = drizzle({ client: migrationClient });
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  await migrate(migrationDb, { migrationsFolder });
  await migrationClient.end();

  // Create the main connection
  const client = postgres(connectionUri);
  const db = drizzle({ client, relations });

  return { container, client, db };
}

/**
 * Stops the test database container and closes connections.
 */
export async function stopTestDatabase(testDb?: TestDatabase): Promise<void> {
  if (!testDb) return;
  await testDb.client?.end();
  await testDb.container?.stop();
}
