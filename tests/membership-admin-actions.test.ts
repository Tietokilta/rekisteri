import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as table from "$lib/server/db/schema";
import { approveMembershipInTransaction, endMembershipInTransaction } from "$lib/server/membership/admin-actions";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";

vi.mock("$lib/server/db", () => ({ db: {} }));

let testDb: TestDatabase;
let actorUserId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  actorUserId = crypto.randomUUID();
  await testDb.db.insert(table.user).values({
    id: actorUserId,
    email: `${actorUserId}@example.com`,
    adminRole: "admin",
  });
}, 120_000);

afterAll(async () => {
  await stopTestDatabase(testDb);
});

async function createType(id: string, requiresPayment = true) {
  await testDb.db.insert(table.membershipType).values({
    id,
    name: { fi: id, en: id },
    requiresPayment,
  });
}

async function createPeriod(typeId: string, startDate = "2026-08-01") {
  const id = crypto.randomUUID();
  await testDb.db.insert(table.membershipFeePeriod).values({
    id,
    membershipTypeId: typeId,
    startDate,
    endDate: `${Number(startDate.slice(0, 4)) + 1}-07-31`,
    dueDate: `${startDate.slice(0, 4)}-09-30`,
    nonPaymentActionAt: `${startDate.slice(0, 4)}-12-01`,
    stripePriceId: `price_${id}`,
    publishedAt: new Date(),
  });
  return id;
}

async function createUser() {
  const id = crypto.randomUUID();
  await testDb.db.insert(table.user).values({ id, email: `${id}@example.com`, adminRole: "none" });
  return id;
}

async function createPendingApplication(typeId: string, periodId: string, paid: boolean) {
  const userId = await createUser();
  const memberId = crypto.randomUUID();
  const obligationId = crypto.randomUUID();
  await testDb.db.insert(table.member).values({
    id: memberId,
    userId,
    status: "awaiting_approval",
    pendingMembershipTypeId: typeId,
  });
  await testDb.db.insert(table.membershipObligation).values({
    id: obligationId,
    memberId,
    membershipFeePeriodId: periodId,
    kind: "application",
  });
  if (paid) {
    await testDb.db.insert(table.payment).values({
      id: crypto.randomUUID(),
      memberId,
      membershipFeePeriodId: periodId,
      obligationId,
      source: "stripe",
      status: "succeeded",
      amount: 800,
      currency: "eur",
      paidAt: new Date(),
    });
  }
  await testDb.db.insert(table.membershipEvent).values({
    id: crypto.randomUUID(),
    memberId,
    eventType: "application_submitted",
    effectiveAt: new Date(),
    source: "system",
    certainty: "confirmed",
    membershipFeePeriodId: periodId,
    data: { membershipTypeId: typeId },
  });
  return { memberId, obligationId };
}

describe("membership board decisions", () => {
  it("activates a paid first-time applicant and records the decision", async () => {
    const typeId = `type-${crypto.randomUUID()}`;
    await createType(typeId);
    const periodId = await createPeriod(typeId);
    const laterPeriodId = await createPeriod(typeId, "2027-08-01");
    const { memberId } = await createPendingApplication(typeId, periodId, true);

    const result = await testDb.db.transaction((tx) => approveMembershipInTransaction(tx, memberId, actorUserId));

    expect(result.kind).toBe("application");
    const member = await testDb.db.query.member.findFirst({ where: { id: memberId } });
    expect(member).toMatchObject({
      status: "active",
      membershipTypeId: typeId,
      pendingMembershipTypeId: null,
    });
    expect(member?.currentMembershipStartedAt).toBeInstanceOf(Date);
    const approval = await testDb.db.query.membershipEvent.findFirst({
      where: { memberId, eventType: "application_approved" },
    });
    expect(approval).toMatchObject({ actorUserId, membershipFeePeriodId: periodId });
    const catchup = await testDb.db.query.membershipObligation.findFirst({
      where: { memberId, membershipFeePeriodId: laterPeriodId },
    });
    expect(catchup).toMatchObject({ kind: "renewal", disposition: "required" });
  });

  it("does not approve a payable application before its obligation is settled", async () => {
    const typeId = `type-${crypto.randomUUID()}`;
    await createType(typeId);
    const periodId = await createPeriod(typeId);
    const { memberId } = await createPendingApplication(typeId, periodId, false);

    await expect(
      testDb.db.transaction((tx) => approveMembershipInTransaction(tx, memberId, actorUserId)),
    ).rejects.toThrow("pending_obligation_not_settled");

    const member = await testDb.db.query.member.findFirst({ where: { id: memberId } });
    expect(member?.status).toBe("awaiting_approval");
  });

  it("approves a paid type change without interrupting active membership", async () => {
    const oldTypeId = `old-${crypto.randomUUID()}`;
    const newTypeId = `new-${crypto.randomUUID()}`;
    await createType(oldTypeId);
    await createType(newTypeId);
    const periodId = await createPeriod(newTypeId);
    const userId = await createUser();
    const memberId = crypto.randomUUID();
    const obligationId = crypto.randomUUID();
    await testDb.db.insert(table.member).values({
      id: memberId,
      userId,
      status: "active",
      membershipTypeId: oldTypeId,
      pendingMembershipTypeId: newTypeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
    });
    await testDb.db.insert(table.membershipObligation).values({
      id: obligationId,
      memberId,
      membershipFeePeriodId: periodId,
      kind: "type_change",
    });
    await testDb.db.insert(table.payment).values({
      id: crypto.randomUUID(),
      memberId,
      membershipFeePeriodId: periodId,
      obligationId,
      source: "stripe",
      status: "succeeded",
      amount: 800,
      currency: "eur",
      paidAt: new Date(),
    });
    await testDb.db.insert(table.membershipEvent).values({
      id: crypto.randomUUID(),
      memberId,
      eventType: "type_change_requested",
      effectiveAt: new Date(),
      source: "system",
      certainty: "confirmed",
      membershipFeePeriodId: periodId,
      data: { fromMembershipTypeId: oldTypeId, toMembershipTypeId: newTypeId },
    });

    const result = await testDb.db.transaction((tx) => approveMembershipInTransaction(tx, memberId, actorUserId));

    expect(result.kind).toBe("type_change");
    const member = await testDb.db.query.member.findFirst({ where: { id: memberId } });
    expect(member).toMatchObject({
      status: "active",
      membershipTypeId: newTypeId,
      pendingMembershipTypeId: null,
    });
    expect(member?.currentMembershipStartedAt).toEqual(new Date("2024-08-01T00:00:00Z"));
  });
});

describe("ending membership", () => {
  it("ends the stable membership, records why, and cancels open obligations", async () => {
    const typeId = `type-${crypto.randomUUID()}`;
    await createType(typeId);
    const periodId = await createPeriod(typeId);
    const userId = await createUser();
    const memberId = crypto.randomUUID();
    await testDb.db.insert(table.member).values({
      id: memberId,
      userId,
      status: "active",
      membershipTypeId: typeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
    });
    await testDb.db.insert(table.membershipObligation).values({
      id: crypto.randomUUID(),
      memberId,
      membershipFeePeriodId: periodId,
      kind: "renewal",
    });

    await testDb.db.transaction((tx) =>
      endMembershipInTransaction(tx, memberId, actorUserId, "resigned_voluntarily", "Requested by member"),
    );

    const member = await testDb.db.query.member.findFirst({ where: { id: memberId } });
    expect(member?.status).toBe("ended");
    expect(member?.currentMembershipEndedAt).toBeInstanceOf(Date);
    const obligation = await testDb.db.query.membershipObligation.findFirst({ where: { memberId } });
    expect(obligation).toMatchObject({ disposition: "cancelled", dispositionReason: "membership_ended" });
    const event = await testDb.db.query.membershipEvent.findFirst({
      where: { memberId, eventType: "resigned_voluntarily" },
    });
    expect(event).toMatchObject({ actorUserId, data: { reason: "Requested by member" } });
  });
});
