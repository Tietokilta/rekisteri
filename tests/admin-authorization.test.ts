import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  ADMIN_ROLE_VALUES,
  hasClientAdminAccess,
  hasClientAdminWriteAccess,
  type AdminRole,
} from "../src/lib/shared/enums";
import { hasAdminAccess, hasAdminWriteAccess, isReadOnlyAdmin } from "../src/lib/server/auth/admin";

/**
 * Admin authorization tests.
 *
 * Tests the three-tier admin role system:
 * - none: Regular users with no admin access
 * - readonly: Can view admin pages but cannot make changes
 * - admin: Full admin access with read/write permissions
 */

// ─── Unit tests for server-side authorization helpers ──────────────────────

describe("hasAdminAccess", () => {
  it("returns true for admin role", () => {
    expect(hasAdminAccess({ adminRole: "admin" })).toBe(true);
  });

  it("returns true for readonly role", () => {
    expect(hasAdminAccess({ adminRole: "readonly" })).toBe(true);
  });

  it("returns false for none role", () => {
    expect(hasAdminAccess({ adminRole: "none" })).toBe(false);
  });

  it("returns false for null user", () => {
    expect(hasAdminAccess(null)).toBe(false);
  });

  it("returns false for undefined user", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(hasAdminAccess(undefined)).toBe(false);
  });
});

describe("hasAdminWriteAccess", () => {
  it("returns true for admin role", () => {
    expect(hasAdminWriteAccess({ adminRole: "admin" })).toBe(true);
  });

  it("returns false for readonly role", () => {
    expect(hasAdminWriteAccess({ adminRole: "readonly" })).toBe(false);
  });

  it("returns false for none role", () => {
    expect(hasAdminWriteAccess({ adminRole: "none" })).toBe(false);
  });

  it("returns false for null user", () => {
    expect(hasAdminWriteAccess(null)).toBe(false);
  });

  it("returns false for undefined user", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(hasAdminWriteAccess(undefined)).toBe(false);
  });
});

describe("isReadOnlyAdmin", () => {
  it("returns true for readonly role", () => {
    expect(isReadOnlyAdmin({ adminRole: "readonly" })).toBe(true);
  });

  it("returns false for admin role", () => {
    expect(isReadOnlyAdmin({ adminRole: "admin" })).toBe(false);
  });

  it("returns false for none role", () => {
    expect(isReadOnlyAdmin({ adminRole: "none" })).toBe(false);
  });

  it("returns false for null user", () => {
    expect(isReadOnlyAdmin(null)).toBe(false);
  });

  it("returns false for undefined user", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(isReadOnlyAdmin(undefined)).toBe(false);
  });
});

// ─── Unit tests for client-side authorization helpers ──────────────────────

describe("hasClientAdminAccess", () => {
  it("returns true for admin role", () => {
    expect(hasClientAdminAccess("admin")).toBe(true);
  });

  it("returns true for readonly role", () => {
    expect(hasClientAdminAccess("readonly")).toBe(true);
  });

  it("returns false for none role", () => {
    expect(hasClientAdminAccess("none")).toBe(false);
  });
});

describe("hasClientAdminWriteAccess", () => {
  it("returns true for admin role", () => {
    expect(hasClientAdminWriteAccess("admin")).toBe(true);
  });

  it("returns false for readonly role", () => {
    expect(hasClientAdminWriteAccess("readonly")).toBe(false);
  });

  it("returns false for none role", () => {
    expect(hasClientAdminWriteAccess("none")).toBe(false);
  });
});

// ─── DB integration tests ──────────────────────────────────────────────────

describe("Admin role database operations", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("stores and retrieves admin role correctly", async () => {
    const { db } = testDb;

    for (const role of ADMIN_ROLE_VALUES) {
      const userId = crypto.randomUUID();
      await db.insert(table.user).values({
        id: userId,
        email: `test-${role}-${userId}@example.com`,
        adminRole: role,
      });

      const user = await db.query.user.findFirst({
        where: eq(table.user.id, userId),
      });

      expect(user?.adminRole).toBe(role);
    }
  });

  it("defaults to 'none' when adminRole is not specified", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();

    // Insert without specifying adminRole
    await db.insert(table.user).values({
      id: userId,
      email: `test-default-${userId}@example.com`,
    });

    const user = await db.query.user.findFirst({
      where: eq(table.user.id, userId),
    });

    expect(user?.adminRole).toBe("none");
  });

  it("can update user role from none to admin", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();

    await db.insert(table.user).values({
      id: userId,
      email: `test-promote-${userId}@example.com`,
      adminRole: "none",
    });

    await db.update(table.user).set({ adminRole: "admin" }).where(eq(table.user.id, userId));

    const user = await db.query.user.findFirst({
      where: eq(table.user.id, userId),
    });

    expect(user?.adminRole).toBe("admin");
  });

  it("can update user role from admin to readonly", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();

    await db.insert(table.user).values({
      id: userId,
      email: `test-demote-${userId}@example.com`,
      adminRole: "admin",
    });

    await db.update(table.user).set({ adminRole: "readonly" }).where(eq(table.user.id, userId));

    const user = await db.query.user.findFirst({
      where: eq(table.user.id, userId),
    });

    expect(user?.adminRole).toBe("readonly");
  });

  it("can update user role from readonly to none", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();

    await db.insert(table.user).values({
      id: userId,
      email: `test-remove-${userId}@example.com`,
      adminRole: "readonly",
    });

    await db.update(table.user).set({ adminRole: "none" }).where(eq(table.user.id, userId));

    const user = await db.query.user.findFirst({
      where: eq(table.user.id, userId),
    });

    expect(user?.adminRole).toBe("none");
  });
});

// ─── Last admin protection tests (business logic simulation) ───────────────

describe("Last admin protection", () => {
  let testDb: TestDatabase;
  const testUserIds: string[] = [];

  beforeAll(async () => {
    testDb = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  async function countAdmins(db: TestDatabase["db"], userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const result = await db
      .select({ count: sql<string>`count(*)` })
      .from(table.user)
      .where(
        sql`${table.user.id} IN (${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `,
        )}) AND ${table.user.adminRole} = 'admin'`,
      );
    return Number.parseInt(result[0]?.count ?? "0", 10);
  }

  async function createUserWithRole(db: TestDatabase["db"], role: AdminRole): Promise<string> {
    const userId = crypto.randomUUID();
    await db.insert(table.user).values({
      id: userId,
      email: `test-${role}-${userId}@example.com`,
      adminRole: role,
    });
    testUserIds.push(userId);
    return userId;
  }

  it("allows demoting admin when other admins exist", async () => {
    const { db } = testDb;
    const localUserIds: string[] = [];

    // Create two admins
    const admin1Id = await createUserWithRole(db, "admin");
    localUserIds.push(admin1Id);
    const admin2Id = await createUserWithRole(db, "admin");
    localUserIds.push(admin2Id);

    expect(await countAdmins(db, localUserIds)).toBe(2);

    // Demote first admin to readonly
    await db.update(table.user).set({ adminRole: "readonly" }).where(eq(table.user.id, admin1Id));

    expect(await countAdmins(db, localUserIds)).toBe(1);

    // Second admin should still exist
    const admin2 = await db.query.user.findFirst({
      where: eq(table.user.id, admin2Id),
    });
    expect(admin2?.adminRole).toBe("admin");
  });

  it("simulates last admin protection check", async () => {
    const { db } = testDb;
    const localUserIds: string[] = [];

    // Create single admin
    const adminId = await createUserWithRole(db, "admin");
    localUserIds.push(adminId);

    // Get admin count before demotion
    const adminCount = await countAdmins(db, localUserIds);
    expect(adminCount).toBe(1);

    // Simulate the protection check that would happen in updateUserRole
    const shouldBlockDemotion = adminCount <= 1;
    expect(shouldBlockDemotion).toBe(true);

    // Verify admin is still admin (we didn't actually demote)
    const admin = await db.query.user.findFirst({
      where: eq(table.user.id, adminId),
    });
    expect(admin?.adminRole).toBe("admin");
  });

  it("readonly to none does not affect admin count", async () => {
    const { db } = testDb;
    const localUserIds: string[] = [];

    // Create one admin and one readonly
    const adminId = await createUserWithRole(db, "admin");
    localUserIds.push(adminId);
    const readonlyId = await createUserWithRole(db, "readonly");
    localUserIds.push(readonlyId);

    const initialAdminCount = await countAdmins(db, localUserIds);
    expect(initialAdminCount).toBe(1);

    // Demoting readonly to none should not affect admin count
    await db.update(table.user).set({ adminRole: "none" }).where(eq(table.user.id, readonlyId));

    expect(await countAdmins(db, localUserIds)).toBe(initialAdminCount);

    // Admin should still be admin
    const admin = await db.query.user.findFirst({
      where: eq(table.user.id, adminId),
    });
    expect(admin?.adminRole).toBe("admin");
  });
});

// ─── Role hierarchy tests ──────────────────────────────────────────────────

describe("Role hierarchy", () => {
  const roles: AdminRole[] = ["none", "readonly", "admin"];

  it("admin has both read and write access", () => {
    const role: AdminRole = "admin";
    expect(hasClientAdminAccess(role)).toBe(true);
    expect(hasClientAdminWriteAccess(role)).toBe(true);
  });

  it("readonly has read access but not write access", () => {
    const role: AdminRole = "readonly";
    expect(hasClientAdminAccess(role)).toBe(true);
    expect(hasClientAdminWriteAccess(role)).toBe(false);
  });

  it("none has neither read nor write access", () => {
    const role: AdminRole = "none";
    expect(hasClientAdminAccess(role)).toBe(false);
    expect(hasClientAdminWriteAccess(role)).toBe(false);
  });

  it("write access implies read access", () => {
    for (const role of roles) {
      if (hasClientAdminWriteAccess(role)) {
        expect(hasClientAdminAccess(role)).toBe(true);
      }
    }
  });

  it("all roles are covered in ADMIN_ROLE_VALUES", () => {
    expect(ADMIN_ROLE_VALUES).toContain("none");
    expect(ADMIN_ROLE_VALUES).toContain("readonly");
    expect(ADMIN_ROLE_VALUES).toContain("admin");
    expect(ADMIN_ROLE_VALUES.length).toBe(3);
  });
});
