import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import type { MemberStatus } from "../src/lib/shared/enums";
import { MEMBER_STATUS_VALUES } from "../src/lib/shared/enums";
import { isValidTransition, validateTransition, getValidTargetStatuses } from "$lib/server/utils/member";

/**
 * Member status state machine tests.
 *
 * Valid transitions (aligned with Tietokilta bylaws):
 *
 *   awaiting_payment → active           (admin approve, e.g. cash payment)
 *   awaiting_payment → awaiting_approval (Stripe payment succeeds)
 *   awaiting_payment → rejected         (payment failed/expired, admin reject)
 *   awaiting_approval → active          (board approves, §26)
 *   awaiting_approval → rejected        (board rejects application)
 *   active → resigned                   (voluntary §8p1, deemed resigned §8p2, expelled §9)
 *   resigned → active                   (admin reactivate)
 *   rejected → active                   (admin reactivate)
 *
 * Invalid transitions (prevented by application logic):
 *   awaiting_payment → resigned    (never became a member)
 *   awaiting_approval → resigned   (never became a member)
 *   active → rejected              (was a member, use resigned instead)
 *   resigned → rejected            (no reason to reject after resignation)
 *   rejected → resigned            (was never a member)
 */

// ─── Unit tests for transition validation util ──────────────────────────

describe("isValidTransition", () => {
  describe("valid transitions", () => {
    const validCases: [MemberStatus, MemberStatus, string][] = [
      ["awaiting_payment", "active", "admin approve / cash payment"],
      ["awaiting_payment", "awaiting_approval", "Stripe payment succeeds"],
      ["awaiting_payment", "rejected", "payment failed / admin reject"],
      ["awaiting_approval", "active", "board approves §26"],
      ["awaiting_approval", "rejected", "board rejects application"],
      ["active", "resigned", "voluntary §8p1, deemed resigned §8p2, expelled §9"],
      ["resigned", "active", "admin reactivate"],
      ["rejected", "active", "admin reactivate"],
    ];

    for (const [from, to, reason] of validCases) {
      it(`${from} → ${to} (${reason})`, () => {
        expect(isValidTransition(from, to)).toBe(true);
      });
    }
  });

  describe("invalid transitions", () => {
    const invalidCases: [MemberStatus, MemberStatus, string][] = [
      ["awaiting_payment", "resigned", "never became a member"],
      ["awaiting_approval", "resigned", "never became a member"],
      ["active", "rejected", "was a member, use resigned instead"],
      ["active", "awaiting_payment", "cannot go back to payment"],
      ["active", "awaiting_approval", "cannot go back to approval"],
      ["resigned", "rejected", "no reason to reject after resignation"],
      ["resigned", "awaiting_payment", "cannot go back to payment"],
      ["resigned", "awaiting_approval", "cannot go back to approval"],
      ["rejected", "resigned", "was never a member"],
      ["rejected", "awaiting_payment", "cannot go back to payment"],
      ["rejected", "awaiting_approval", "cannot go back to approval"],
    ];

    for (const [from, to, reason] of invalidCases) {
      it(`${from} → ${to} (${reason})`, () => {
        expect(isValidTransition(from, to)).toBe(false);
      });
    }
  });

  it("self-transitions are invalid for all statuses", () => {
    for (const status of MEMBER_STATUS_VALUES) {
      expect(isValidTransition(status, status)).toBe(false);
    }
  });
});

describe("validateTransition", () => {
  it("returns the target status on valid transition", () => {
    expect(validateTransition("awaiting_approval", "active")).toBe("active");
    expect(validateTransition("active", "resigned")).toBe("resigned");
  });

  it("throws on invalid transition", () => {
    expect(() => validateTransition("active", "rejected")).toThrow("Invalid status transition: active → rejected");
  });

  it("throws with descriptive message including both statuses", () => {
    expect(() => validateTransition("resigned", "rejected")).toThrow(/resigned.*rejected/);
  });
});

describe("getValidTargetStatuses", () => {
  it("returns correct targets for awaiting_payment", () => {
    expect(getValidTargetStatuses("awaiting_payment")).toEqual(["active", "awaiting_approval", "rejected"]);
  });

  it("returns correct targets for awaiting_approval", () => {
    expect(getValidTargetStatuses("awaiting_approval")).toEqual(["active", "rejected"]);
  });

  it("returns correct targets for active", () => {
    expect(getValidTargetStatuses("active")).toEqual(["resigned"]);
  });

  it("returns correct targets for resigned", () => {
    expect(getValidTargetStatuses("resigned")).toEqual(["active"]);
  });

  it("returns correct targets for rejected", () => {
    expect(getValidTargetStatuses("rejected")).toEqual(["active"]);
  });

  it("every status has at least one valid target", () => {
    for (const status of MEMBER_STATUS_VALUES) {
      expect(getValidTargetStatuses(status).length).toBeGreaterThan(0);
    }
  });
});

// ─── DB integration tests (lifecycle scenarios) ─────────────────────────

let testDb: TestDatabase;
let membershipTypeId: string;
let membershipId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();

  // Create a membership type and membership period
  membershipTypeId = "test-type";
  membershipId = "test-membership";

  await testDb.db.insert(table.membershipType).values({
    id: membershipTypeId,
    name: { fi: "Testityppi", en: "Test type" },
  });

  await testDb.db.insert(table.membership).values({
    id: membershipId,
    membershipTypeId,
    startTime: new Date("2025-01-01"),
    endTime: new Date("2025-12-31"),
    requiresStudentVerification: false,
  });
}, 30_000);

afterAll(async () => {
  await stopTestDatabase(testDb);
}, 30_000);

// Helper to create a user + member with a given status
async function createMemberWithStatus(status: MemberStatus) {
  const userId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  await testDb.db.insert(table.user).values({
    id: userId,
    email: `test-${userId}@example.com`,
    isAdmin: false,
  });

  await testDb.db.insert(table.member).values({
    id: memberId,
    userId,
    membershipId,
    status,
  });

  return { userId, memberId };
}

// Helper to validate + update member status using the shared util, then verify in DB
async function transitionStatus(memberId: string, currentStatus: MemberStatus, newStatus: MemberStatus) {
  validateTransition(currentStatus, newStatus);

  await testDb.db.update(table.member).set({ status: newStatus }).where(eq(table.member.id, memberId));

  const updated = await testDb.db.query.member.findFirst({
    where: eq(table.member.id, memberId),
  });

  return updated;
}

describe("DB lifecycle scenarios (using validateTransition)", () => {
  it("happy path: payment → approval → active → resigned", async () => {
    const { memberId } = await createMemberWithStatus("awaiting_payment");

    // Stripe payment succeeds → moves to awaiting_approval
    let result = await transitionStatus(memberId, "awaiting_payment", "awaiting_approval");
    expect(result?.status).toBe("awaiting_approval");

    // Board approves
    result = await transitionStatus(memberId, "awaiting_approval", "active");
    expect(result?.status).toBe("active");

    // Year-end: deemed resigned for non-payment
    result = await transitionStatus(memberId, "active", "resigned");
    expect(result?.status).toBe("resigned");
  });

  it("payment fails: payment → rejected", async () => {
    const { memberId } = await createMemberWithStatus("awaiting_payment");

    const result = await transitionStatus(memberId, "awaiting_payment", "rejected");
    expect(result?.status).toBe("rejected");
  });

  it("cash payment: payment → active (skip approval)", async () => {
    const { memberId } = await createMemberWithStatus("awaiting_payment");

    const result = await transitionStatus(memberId, "awaiting_payment", "active");
    expect(result?.status).toBe("active");
  });

  it("reactivation after resignation: active → resigned → active", async () => {
    const { memberId } = await createMemberWithStatus("active");

    // Member resigns
    let result = await transitionStatus(memberId, "active", "resigned");
    expect(result?.status).toBe("resigned");

    // Admin reactivates
    result = await transitionStatus(memberId, "resigned", "active");
    expect(result?.status).toBe("active");
  });

  it("rejected application reactivated: rejected → active", async () => {
    const { memberId } = await createMemberWithStatus("awaiting_approval");

    // Board rejects
    let result = await transitionStatus(memberId, "awaiting_approval", "rejected");
    expect(result?.status).toBe("rejected");

    // Admin reconsiders and reactivates
    result = await transitionStatus(memberId, "rejected", "active");
    expect(result?.status).toBe("active");
  });

  it("invalid transition throws before reaching DB", async () => {
    const { memberId } = await createMemberWithStatus("active");

    // Attempting active → rejected should throw
    expect(() => validateTransition("active", "rejected")).toThrow("Invalid status transition");

    // Verify member is still active in DB
    const member = await testDb.db.query.member.findFirst({
      where: eq(table.member.id, memberId),
    });
    expect(member?.status).toBe("active");
  });
});
