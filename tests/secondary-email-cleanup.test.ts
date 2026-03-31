import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, isNull, lt } from "drizzle-orm";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "$lib/server/db/schema";

describe("Secondary email cleanup and uniqueness", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  async function createUser(email: string) {
    const userId = crypto.randomUUID();
    await testDb.db.insert(table.user).values({
      id: userId,
      email,
      adminRole: "none",
    });
    return userId;
  }

  async function insertSecondaryEmail(
    userId: string,
    email: string,
    options: { verifiedAt?: Date | null; createdAt?: Date } = {},
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test helper, email format guaranteed
    const domain = email.split("@")[1]!;
    const now = new Date();
    const record: table.SecondaryEmail = {
      id: crypto.randomUUID(),
      userId,
      email: email.toLowerCase(),
      domain,
      verifiedAt: options.verifiedAt ?? null,
      expiresAt: null,
      createdAt: options.createdAt ?? now,
      updatedAt: options.createdAt ?? now,
    };
    await testDb.db.insert(table.secondaryEmail).values(record);
    return record;
  }

  /** Replicate the cleanup query from cleanupExpiredTokens */
  async function runUnverifiedEmailCleanup() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return testDb.db
      .delete(table.secondaryEmail)
      .where(and(isNull(table.secondaryEmail.verifiedAt), lt(table.secondaryEmail.updatedAt, oneDayAgo)))
      .returning({ id: table.secondaryEmail.id });
  }

  describe("unique_user_secondary_email index", () => {
    it("should prevent duplicate (userId, email) pairs", async () => {
      const userId = await createUser("unique-test@example.com");
      await insertSecondaryEmail(userId, "dupe@example.com");

      await expect(insertSecondaryEmail(userId, "dupe@example.com")).rejects.toThrow();
    });

    it("should allow different users to have the same unverified email", async () => {
      const userId1 = await createUser("user1-same-email@example.com");
      const userId2 = await createUser("user2-same-email@example.com");

      await insertSecondaryEmail(userId1, "shared@example.com");
      await insertSecondaryEmail(userId2, "shared@example.com");

      const results = await testDb.db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.email, "shared@example.com"));
      expect(results).toHaveLength(2);
    });

    it("should allow same user to have different emails", async () => {
      const userId = await createUser("multi-email@example.com");
      await insertSecondaryEmail(userId, "a@example.com");
      await insertSecondaryEmail(userId, "b@example.com");

      const results = await testDb.db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.userId, userId));
      expect(results).toHaveLength(2);
    });
  });

  describe("cleanup of unverified secondary emails", () => {
    it("should delete unverified secondary emails older than 24 hours", async () => {
      const userId = await createUser("cleanup-old@example.com");
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      await insertSecondaryEmail(userId, "old-unverified@example.com", { createdAt: twoDaysAgo });

      const deleted = await runUnverifiedEmailCleanup();
      expect(deleted.length).toBeGreaterThanOrEqual(1);

      const after = await testDb.db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.email, "old-unverified@example.com"));
      expect(after).toHaveLength(0);
    });

    it("should not delete verified secondary emails regardless of age", async () => {
      const userId = await createUser("cleanup-verified@example.com");
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

      await insertSecondaryEmail(userId, "old-verified@example.com", {
        createdAt: twoDaysAgo,
        verifiedAt: twoDaysAgo,
      });

      await runUnverifiedEmailCleanup();

      const after = await testDb.db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.email, "old-verified@example.com"));
      expect(after).toHaveLength(1);
    });

    it("should not delete recent unverified secondary emails", async () => {
      const userId = await createUser("cleanup-recent@example.com");

      // Created just now — should survive the 24h cutoff
      await insertSecondaryEmail(userId, "recent-unverified@example.com");

      await runUnverifiedEmailCleanup();

      const after = await testDb.db
        .select()
        .from(table.secondaryEmail)
        .where(eq(table.secondaryEmail.email, "recent-unverified@example.com"));
      expect(after).toHaveLength(1);
    });
  });
});
