import { and, eq, isNotNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "$lib/server/db/schema";
import type { relations } from "../src/lib/server/db/relations";
import { route } from "../src/lib/ROUTES";
import { test, expect } from "./fixtures/isolated-user";

async function applicationTarget(db: PostgresJsDatabase<typeof relations>) {
  const [target] = await db
    .select({
      id: table.membershipFeePeriod.id,
      membershipTypeId: table.membershipFeePeriod.membershipTypeId,
    })
    .from(table.membershipFeePeriod)
    .innerJoin(table.membershipType, eq(table.membershipType.id, table.membershipFeePeriod.membershipTypeId))
    .where(
      and(
        eq(table.membershipFeePeriod.acceptsApplications, true),
        isNotNull(table.membershipFeePeriod.stripePriceId),
        eq(table.membershipType.purchasable, true),
      ),
    )
    .limit(1);
  if (!target) throw new Error("No purchasable application target found in seed data");
  return target;
}

test.describe("Membership purchase availability", () => {
  test("shows the selected application target to a user without a membership", async ({ isolatedPage, db }) => {
    const target = await applicationTarget(db);

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));

    await expect(isolatedPage.locator(`input[type="radio"][value="${target.id}"]`)).toBeVisible();
  });

  test("blocks another purchase while an application is pending", async ({ isolatedPage, isolatedUser, db }) => {
    const target = await applicationTarget(db);
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      status: "awaiting_payment",
      pendingMembershipTypeId: target.membershipTypeId,
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));

    await expect(isolatedPage.locator('input[type="radio"][name="feePeriodId"]')).toHaveCount(0);
  });

  test("shows an unpaid target as a renewal for an active member of the same type", async ({
    isolatedPage,
    isolatedUser,
    db,
  }) => {
    const target = await applicationTarget(db);
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      status: "active",
      membershipTypeId: target.membershipTypeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));

    const option = isolatedPage.locator("label").filter({
      has: isolatedPage.locator(`input[type="radio"][value="${target.id}"]`),
    });
    await expect(option).toContainText("Jäsenmaksun uusinta — ei uutta hallituksen hyväksyntää");
  });

  test("hides a target that already has a valid successful payment", async ({ isolatedPage, isolatedUser, db }) => {
    const target = await applicationTarget(db);
    const memberId = crypto.randomUUID();
    const obligationId = crypto.randomUUID();
    await db.insert(table.member).values({
      id: memberId,
      userId: isolatedUser.id,
      status: "active",
      membershipTypeId: target.membershipTypeId,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
    });
    await db.insert(table.membershipObligation).values({
      id: obligationId,
      memberId,
      membershipFeePeriodId: target.id,
      kind: "renewal",
    });
    await db.insert(table.payment).values({
      id: crypto.randomUUID(),
      memberId,
      membershipFeePeriodId: target.id,
      obligationId,
      source: "stripe",
      status: "succeeded",
      amount: 800,
      currency: "eur",
      paidAt: new Date(),
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));

    await expect(isolatedPage.locator(`input[type="radio"][value="${target.id}"]`)).toHaveCount(0);
  });

  test("marks a different membership type as requiring board approval", async ({ isolatedPage, isolatedUser, db }) => {
    const target = await applicationTarget(db);
    const otherType = await db.query.membershipType.findFirst({
      where: { id: { ne: target.membershipTypeId } },
    });
    if (!otherType) throw new Error("No alternate membership type found in seed data");
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      status: "active",
      membershipTypeId: otherType.id,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }));

    const option = isolatedPage.locator("label").filter({
      has: isolatedPage.locator(`input[type="radio"][value="${target.id}"]`),
    });
    await expect(option).toContainText("Vaatii hallituksen hyväksynnän maksun jälkeen");
  });
});
