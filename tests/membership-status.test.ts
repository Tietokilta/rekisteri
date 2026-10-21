import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "$lib/server/db/schema";
import type { MemberStatus } from "$lib/server/db/schema";
import { membershipTypeAt, membershipTypesAt } from "../src/lib/server/membership/status";

const now = new Date("2026-10-21T12:00:00Z");
const lastPeriod = { startTime: new Date("2025-08-01"), endTime: new Date("2026-07-31") };
const thisPeriod = { startTime: new Date("2026-08-01"), endTime: new Date("2027-07-31") };
const nextPeriod = { startTime: new Date("2027-08-01"), endTime: new Date("2028-07-31") };

describe("membership status", () => {
  let testDb: TestDatabase;
  let db: TestDatabase["db"];

  async function createUserWith(memberships: { typeId: string; period: typeof lastPeriod; status: MemberStatus }[]) {
    const userId = crypto.randomUUID();
    await db.insert(table.user).values({ id: userId, email: `${userId}@example.com`, adminRole: "none" });
    for (const { typeId, period, status } of memberships) {
      const membershipId = crypto.randomUUID();
      await db
        .insert(table.membershipType)
        .values({ id: `${typeId}-${membershipId}`, name: { fi: typeId, en: typeId } });
      await db
        .insert(table.membership)
        .values({ id: membershipId, membershipTypeId: `${typeId}-${membershipId}`, ...period });
      await db.insert(table.member).values({ id: crypto.randomUUID(), userId, membershipId, status });
    }
    return userId;
  }

  async function typeOf(userId: string) {
    return (await membershipTypeAt(db, userId, now))?.split("-", 1)[0] ?? null;
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase(testDb);
  });

  it("keeps an active member whose fee period has ended", async () => {
    const userId = await createUserWith([{ typeId: "regular", period: lastPeriod, status: "active" }]);
    expect(await typeOf(userId)).toBe("regular");
  });

  it("does not count resigned, rejected or unapproved memberships", async () => {
    for (const status of ["resigned", "rejected", "awaiting_payment", "awaiting_approval"] as const) {
      const userId = await createUserWith([{ typeId: "regular", period: thisPeriod, status }]);
      expect(await typeOf(userId)).toBeNull();
    }
  });

  it("takes the type from the latest started membership", async () => {
    const userId = await createUserWith([
      { typeId: "student", period: lastPeriod, status: "active" },
      { typeId: "regular", period: thisPeriod, status: "active" },
      { typeId: "senior", period: nextPeriod, status: "active" },
    ]);
    expect(await typeOf(userId)).toBe("regular");
  });

  it("counts a member whose first period has not started yet", async () => {
    const userId = await createUserWith([{ typeId: "regular", period: nextPeriod, status: "active" }]);
    expect(await typeOf(userId)).toBe("regular");
  });

  it("looks up many users at once", async () => {
    const member = await createUserWith([{ typeId: "regular", period: lastPeriod, status: "active" }]);
    const resigned = await createUserWith([{ typeId: "regular", period: lastPeriod, status: "resigned" }]);
    const types = await membershipTypesAt(db, now, [member, resigned]);
    expect([...types.keys()]).toEqual([member]);
  });
});
