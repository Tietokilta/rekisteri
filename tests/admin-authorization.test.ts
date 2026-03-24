import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  ADMIN_ROLE_VALUES,
  hasAdminAccess,
  hasAdminWriteAccess,
  isReadOnlyAdmin,
  type AdminRole,
} from "../src/lib/shared/enums";
import {
  hasAdminAccess as userHasAdminAccess,
  hasAdminWriteAccess as userHasAdminWriteAccess,
  isReadOnlyAdmin as userIsReadOnlyAdmin,
} from "../src/lib/server/auth/admin";

/**
 * Admin authorization tests.
 *
 * Tests the three-tier admin role system:
 * - none: Regular users with no admin access
 * - readonly: Can view admin pages but cannot make changes
 * - admin: Full admin access with read/write permissions
 */

// ─── Shared role helpers (from enums.ts) ───────────────────────────────────

describe("hasAdminAccess (role)", () => {
  it("returns true for admin", () => expect(hasAdminAccess("admin")).toBe(true));
  it("returns true for readonly", () => expect(hasAdminAccess("readonly")).toBe(true));
  it("returns false for none", () => expect(hasAdminAccess("none")).toBe(false));
});

describe("hasAdminWriteAccess (role)", () => {
  it("returns true for admin", () => expect(hasAdminWriteAccess("admin")).toBe(true));
  it("returns false for readonly", () => expect(hasAdminWriteAccess("readonly")).toBe(false));
  it("returns false for none", () => expect(hasAdminWriteAccess("none")).toBe(false));
});

describe("isReadOnlyAdmin (role)", () => {
  it("returns true for readonly", () => expect(isReadOnlyAdmin("readonly")).toBe(true));
  it("returns false for admin", () => expect(isReadOnlyAdmin("admin")).toBe(false));
  it("returns false for none", () => expect(isReadOnlyAdmin("none")).toBe(false));
});

// ─── Server-side null-safe wrappers (from server/auth/admin.ts) ────────────

describe("server-side hasAdminAccess (user object)", () => {
  it("delegates to shared helper for valid users", () => {
    for (const role of ADMIN_ROLE_VALUES) {
      expect(userHasAdminAccess({ adminRole: role })).toBe(hasAdminAccess(role));
    }
  });

  it("returns false for null user", () => expect(userHasAdminAccess(null)).toBe(false));

  it("returns false for undefined user", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(userHasAdminAccess(undefined)).toBe(false);
  });
});

describe("server-side hasAdminWriteAccess (user object)", () => {
  it("delegates to shared helper for valid users", () => {
    for (const role of ADMIN_ROLE_VALUES) {
      expect(userHasAdminWriteAccess({ adminRole: role })).toBe(hasAdminWriteAccess(role));
    }
  });

  it("returns false for null user", () => expect(userHasAdminWriteAccess(null)).toBe(false));

  it("returns false for undefined user", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(userHasAdminWriteAccess(undefined)).toBe(false);
  });
});

describe("server-side isReadOnlyAdmin (user object)", () => {
  it("delegates to shared helper for valid users", () => {
    for (const role of ADMIN_ROLE_VALUES) {
      expect(userIsReadOnlyAdmin({ adminRole: role })).toBe(isReadOnlyAdmin(role));
    }
  });

  it("returns false for null user", () => expect(userIsReadOnlyAdmin(null)).toBe(false));

  it("returns false for undefined user", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(userIsReadOnlyAdmin(undefined)).toBe(false);
  });
});

// ─── Role hierarchy tests ──────────────────────────────────────────────────

describe("Role hierarchy", () => {
  it("admin has both read and write access", () => {
    expect(hasAdminAccess("admin")).toBe(true);
    expect(hasAdminWriteAccess("admin")).toBe(true);
  });

  it("readonly has read access but not write access", () => {
    expect(hasAdminAccess("readonly")).toBe(true);
    expect(hasAdminWriteAccess("readonly")).toBe(false);
  });

  it("none has neither read nor write access", () => {
    expect(hasAdminAccess("none")).toBe(false);
    expect(hasAdminWriteAccess("none")).toBe(false);
  });

  it("write access implies read access", () => {
    for (const role of ADMIN_ROLE_VALUES) {
      if (hasAdminWriteAccess(role)) {
        expect(hasAdminAccess(role)).toBe(true);
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

    const admin1Id = await createUserWithRole(db, "admin");
    localUserIds.push(admin1Id);
    const admin2Id = await createUserWithRole(db, "admin");
    localUserIds.push(admin2Id);

    expect(await countAdmins(db, localUserIds)).toBe(2);

    await db.update(table.user).set({ adminRole: "readonly" }).where(eq(table.user.id, admin1Id));

    expect(await countAdmins(db, localUserIds)).toBe(1);

    const admin2 = await db.query.user.findFirst({
      where: eq(table.user.id, admin2Id),
    });
    expect(admin2?.adminRole).toBe("admin");
  });

  it("simulates last admin protection check", async () => {
    const { db } = testDb;
    const localUserIds: string[] = [];

    const adminId = await createUserWithRole(db, "admin");
    localUserIds.push(adminId);

    const adminCount = await countAdmins(db, localUserIds);
    expect(adminCount).toBe(1);

    const shouldBlockDemotion = adminCount <= 1;
    expect(shouldBlockDemotion).toBe(true);

    const admin = await db.query.user.findFirst({
      where: eq(table.user.id, adminId),
    });
    expect(admin?.adminRole).toBe("admin");
  });

  it("readonly to none does not affect admin count", async () => {
    const { db } = testDb;
    const localUserIds: string[] = [];

    const adminId = await createUserWithRole(db, "admin");
    localUserIds.push(adminId);
    const readonlyId = await createUserWithRole(db, "readonly");
    localUserIds.push(readonlyId);

    const initialAdminCount = await countAdmins(db, localUserIds);
    expect(initialAdminCount).toBe(1);

    await db.update(table.user).set({ adminRole: "none" }).where(eq(table.user.id, readonlyId));

    expect(await countAdmins(db, localUserIds)).toBe(initialAdminCount);

    const admin = await db.query.user.findFirst({
      where: eq(table.user.id, adminId),
    });
    expect(admin?.adminRole).toBe("admin");
  });
});
