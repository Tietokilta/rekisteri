import { test as authTest, type UserInfo } from "./auth";
import type { Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type Schema, dbSchema } from "../../src/lib/server/db";

type DbFixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  adminUser: UserInfo;
  db: PostgresJsDatabase<Schema>;
};

type WorkerFixtures = {
  dbConnection: {
    client: ReturnType<typeof postgres>;
    db: PostgresJsDatabase<Schema>;
  };
};

/**
 * Extended test fixture with auth fixtures + database access
 * Database connection is properly worker-scoped for efficiency
 */
export const test = authTest.extend<DbFixtures, WorkerFixtures>({
  /**
   * Worker-scoped database connection - shared across all tests in a worker
   */
  dbConnection: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const dbUrl = process.env.DATABASE_URL_TEST;
      if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");

      const client = postgres(dbUrl);
      const db = drizzle({ client, schema: dbSchema, casing: "snake_case" });

      await use({ client, db });

      await client.end();
    },
    { scope: "worker" },
  ],

  /**
   * Provides database access for individual tests
   */
  db: async ({ dbConnection }, use) => {
    await use(dbConnection.db);
  },
});

export { expect } from "@playwright/test";
