import { test as authTest, type UserInfo } from "./auth";
import type { Page } from "@playwright/test";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "../../src/lib/server/db/schema";
import { getDatabaseUrl } from "../testcontainer";

type DbFixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  adminUser: UserInfo;
  db: PostgresJsDatabase<typeof table>;
};

type WorkerFixtures = {
  dbConnection: {
    client: ReturnType<typeof postgres>;
    db: PostgresJsDatabase<typeof table>;
  };
};

/**
 * Extended test fixture with auth fixtures + database access
 * Database connection is properly worker-scoped for efficiency
 */
export const test = authTest.extend<DbFixtures, WorkerFixtures>({
  /**
   * Worker-scoped database connection - shared across all tests in a worker
   * Reads database URL from testcontainer state file
   */
  dbConnection: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const dbUrl = getDatabaseUrl();
      const client = postgres(dbUrl);
      const db = drizzle(client, { schema: table, casing: "snake_case" });

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
