import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Association member integration tests.
 *
 * Tests the database-level constraints and behavior for association members:
 * - The CHECK constraint enforcing XOR between userId and organizationName
 * - The purchasable flag on membership types
 * - Creating association members (no userId, with organizationName)
 * - Creating person members (with userId, no organizationName)
 */

let testDb: TestDatabase;
let membershipTypeId: string;
let associationMembershipTypeId: string;
let membershipId: string;
let associationMembershipId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();

  // Create purchasable membership type
  membershipTypeId = "test-person-type";
  await testDb.db.insert(table.membershipType).values({
    id: membershipTypeId,
    name: { fi: "Henkilöjäsen", en: "Person member" },
    purchasable: true,
  });

  // Create non-purchasable association membership type
  associationMembershipTypeId = "test-association-type";
  await testDb.db.insert(table.membershipType).values({
    id: associationMembershipTypeId,
    name: { fi: "Yhdistysjäsen", en: "Association member" },
    purchasable: false,
  });

  // Create membership periods
  membershipId = "test-person-membership";
  await testDb.db.insert(table.membership).values({
    id: membershipId,
    membershipTypeId,
    startTime: new Date("2025-01-01"),
    endTime: new Date("2025-12-31"),
    requiresStudentVerification: false,
  });

  associationMembershipId = "test-association-membership";
  await testDb.db.insert(table.membership).values({
    id: associationMembershipId,
    membershipTypeId: associationMembershipTypeId,
    startTime: new Date("2025-01-01"),
    endTime: new Date("2025-12-31"),
    requiresStudentVerification: false,
  });
}, 30_000);

afterAll(async () => {
  await stopTestDatabase(testDb);
}, 30_000);

describe("member_user_or_org CHECK constraint", () => {
  it("allows a person member (userId set, organizationName null)", async () => {
    const userId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    await testDb.db.insert(table.user).values({
      id: userId,
      email: `person-${userId}@example.com`,
      adminRole: "none",
    });

    await testDb.db.insert(table.member).values({
      id: memberId,
      userId,
      organizationName: null,
      membershipId,
      status: "active",
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const member = await testDb.db._query.member.findFirst({
      where: eq(table.member.id, memberId),
    });
    expect(member).toBeDefined();
    expect(member?.userId).toBe(userId);
    expect(member?.organizationName).toBeNull();
  });

  it("allows an association member (userId null, organizationName set)", async () => {
    const memberId = crypto.randomUUID();

    await testDb.db.insert(table.member).values({
      id: memberId,
      userId: null,
      organizationName: "Test Association ry",
      membershipId: associationMembershipId,
      status: "active",
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const member = await testDb.db._query.member.findFirst({
      where: eq(table.member.id, memberId),
    });
    expect(member).toBeDefined();
    expect(member?.userId).toBeNull();
    expect(member?.organizationName).toBe("Test Association ry");
  });

  it("rejects a member with both userId and organizationName set", async () => {
    const userId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    await testDb.db.insert(table.user).values({
      id: userId,
      email: `both-${userId}@example.com`,
      adminRole: "none",
    });

    await expect(
      testDb.db.insert(table.member).values({
        id: memberId,
        userId,
        organizationName: "Should not be allowed",
        membershipId,
        status: "active",
      }),
    ).rejects.toThrow();
  });

  it("rejects a member with neither userId nor organizationName set", async () => {
    const memberId = crypto.randomUUID();

    await expect(
      testDb.db.insert(table.member).values({
        id: memberId,
        userId: null,
        organizationName: null,
        membershipId,
        status: "active",
      }),
    ).rejects.toThrow();
  });
});

describe("purchasable flag on membership types", () => {
  it("stores purchasable=true for person membership types", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const mt = await testDb.db._query.membershipType.findFirst({
      where: eq(table.membershipType.id, membershipTypeId),
    });
    expect(mt?.purchasable).toBe(true);
  });

  it("stores purchasable=false for association membership types", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const mt = await testDb.db._query.membershipType.findFirst({
      where: eq(table.membershipType.id, associationMembershipTypeId),
    });
    expect(mt?.purchasable).toBe(false);
  });

  it("defaults purchasable to true when not specified", async () => {
    const id = `test-default-${crypto.randomUUID().slice(0, 8)}`;
    await testDb.db.insert(table.membershipType).values({
      id,
      name: { fi: "Oletus", en: "Default" },
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const mt = await testDb.db._query.membershipType.findFirst({
      where: eq(table.membershipType.id, id),
    });
    expect(mt?.purchasable).toBe(true);
  });
});

describe("association member lifecycle", () => {
  it("association members can have status transitions like person members", async () => {
    const memberId = crypto.randomUUID();

    // Create as active
    await testDb.db.insert(table.member).values({
      id: memberId,
      userId: null,
      organizationName: "Lifecycle Test ry",
      membershipId: associationMembershipId,
      status: "active",
    });

    // Transition to resigned
    await testDb.db.update(table.member).set({ status: "resigned" }).where(eq(table.member.id, memberId));

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    let member = await testDb.db._query.member.findFirst({
      where: eq(table.member.id, memberId),
    });
    expect(member?.status).toBe("resigned");

    // Reactivate
    await testDb.db.update(table.member).set({ status: "active" }).where(eq(table.member.id, memberId));

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    member = await testDb.db._query.member.findFirst({
      where: eq(table.member.id, memberId),
    });
    expect(member?.status).toBe("active");
  });
});
