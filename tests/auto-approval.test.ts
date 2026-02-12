import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { checkAutoApprovalEligibility } from "../src/lib/server/payment/auto-approval";

// Helper to create a membership type
async function createMembershipType(db: TestDatabase["db"], id: string) {
  await db.insert(table.membershipType).values({
    id,
    name: { fi: `Tyyppi ${id}`, en: `Type ${id}` },
  });
}

// Helper to create a membership period
async function createMembership(
  db: TestDatabase["db"],
  opts: {
    id: string;
    membershipTypeId: string;
    startTime: Date;
    endTime: Date;
    requiresStudentVerification?: boolean;
  },
) {
  await db.insert(table.membership).values({
    id: opts.id,
    membershipTypeId: opts.membershipTypeId,
    startTime: opts.startTime,
    endTime: opts.endTime,
    requiresStudentVerification: opts.requiresStudentVerification ?? false,
  });
}

// Helper to create a user
async function createUser(db: TestDatabase["db"], opts: { id: string; email: string }) {
  await db.insert(table.user).values({
    id: opts.id,
    email: opts.email,
    isAdmin: false,
  });
}

// Helper to create a member record
async function createMember(
  db: TestDatabase["db"],
  opts: {
    userId: string;
    membershipId: string;
    status: "awaiting_payment" | "awaiting_approval" | "active" | "resigned" | "rejected";
  },
) {
  await db.insert(table.member).values({
    id: crypto.randomUUID(),
    userId: opts.userId,
    membershipId: opts.membershipId,
    status: opts.status,
  });
}

// Helper to create a secondary email
async function createSecondaryEmail(
  db: TestDatabase["db"],
  opts: {
    userId: string;
    email: string;
    domain: string;
    verifiedAt: Date | null;
    expiresAt: Date | null;
  },
) {
  await db.insert(table.secondaryEmail).values({
    id: crypto.randomUUID(),
    userId: opts.userId,
    email: opts.email,
    domain: opts.domain,
    verifiedAt: opts.verifiedAt,
    expiresAt: opts.expiresAt,
  });
}

// Helper to fetch a membership by ID with assertion
async function getMembership(db: TestDatabase["db"], id: string) {
  const membership = await db.query.membership.findFirst({
    where: (m, { eq }) => eq(m.id, id),
  });
  if (!membership) throw new Error(`Membership ${id} not found`);
  return membership;
}

describe("Auto-approval eligibility", () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("auto-approves when user has active membership of same type in preceding period", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // Previous period
    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "active" });

    // New period
    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(true);
  });

  it("auto-approves when previous membership status is resigned", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "resigned" });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(true);
  });

  it("rejects when user has no previous memberships", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(false);
  });

  it("rejects when previous membership is a different type", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeA = `type-a-${crypto.randomUUID().slice(0, 8)}`;
    const typeB = `type-b-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeA);
    await createMembershipType(db, typeB);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // Previous period - different type
    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeA,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "active" });

    // New period - typeB
    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeB,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(false);
  });

  it("rejects when previous membership was rejected", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "rejected" });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(false);
  });

  it("rejects when there is a gap in membership periods", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // Period from 2 years ago (user had membership)
    await createMembership(db, {
      id: `old-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2023-01-01"),
      endTime: new Date("2023-12-31"),
    });
    await createMember(db, { userId, membershipId: `old-${userId}`, status: "active" });

    // Preceding period exists but user did NOT have a membership for it
    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
    });
    // No member record for prev period!

    // New period
    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(false);
  });

  it("rejects when user skipped a year (preceding period too far in the past)", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // User had active membership in 2023
    await createMembership(db, {
      id: `old-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2023-01-01"),
      endTime: new Date("2023-12-31"),
    });
    await createMember(db, { userId, membershipId: `old-${userId}`, status: "active" });

    // No 2024 period exists at all — user tries to buy 2025
    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(false);
  });

  it("auto-approves student membership with valid aalto.fi secondary email", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // Valid aalto secondary email
    await createSecondaryEmail(db, {
      userId,
      email: `${userId}@aalto.fi`,
      domain: "aalto.fi",
      verifiedAt: new Date("2025-01-01"),
      expiresAt: new Date("2099-01-01"),
    });

    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
      requiresStudentVerification: true,
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "active" });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
      requiresStudentVerification: true,
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(true);
  });

  it("rejects student membership with expired aalto.fi secondary email", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // Expired aalto secondary email
    await createSecondaryEmail(db, {
      userId,
      email: `${userId}@aalto.fi`,
      domain: "aalto.fi",
      verifiedAt: new Date("2024-01-01"),
      expiresAt: new Date("2024-07-01"), // expired
    });

    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
      requiresStudentVerification: true,
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "active" });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
      requiresStudentVerification: true,
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(false);
  });

  it("auto-approves student membership with aalto.fi primary email", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@aalto.fi` });

    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
      requiresStudentVerification: true,
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "active" });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
      requiresStudentVerification: true,
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(true);
  });

  it("auto-approves non-student membership regardless of email", async () => {
    const { db } = testDb;
    const userId = crypto.randomUUID();
    const typeId = `type-${crypto.randomUUID().slice(0, 8)}`;

    await createMembershipType(db, typeId);
    await createUser(db, { id: userId, email: `${userId}@example.com` });

    // No aalto email at all - should still auto-approve for non-student membership
    await createMembership(db, {
      id: `prev-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2024-01-01"),
      endTime: new Date("2024-12-31"),
      requiresStudentVerification: false,
    });
    await createMember(db, { userId, membershipId: `prev-${userId}`, status: "active" });

    await createMembership(db, {
      id: `new-${userId}`,
      membershipTypeId: typeId,
      startTime: new Date("2025-01-01"),
      endTime: new Date("2025-12-31"),
      requiresStudentVerification: false,
    });

    const newMembership = await getMembership(db, `new-${userId}`);

    const result = await checkAutoApprovalEligibility(db, userId, newMembership);
    expect(result).toBe(true);
  });
});
