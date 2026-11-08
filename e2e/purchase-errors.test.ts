import { test, expect } from "./fixtures/isolated-user";
import * as table from "#lib/server/db/schema.js";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

// External member: no student verification, so a description is required
const membershipTypeId = "ulkojasen";
// Price ID from seed data, served by stripe-mock (see global-setup.ts)
const realStripePriceId = "price_1Sqs7y2a3B4f6jfhHjnWzk9n";

test.describe("Membership purchase errors", () => {
  let testMembershipIds: string[] = [];

  test.afterEach(async ({ db }) => {
    for (const id of testMembershipIds) {
      await db.delete(table.member).where(eq(table.member.membershipId, id));
      await db.delete(table.membership).where(eq(table.membership.id, id));
    }
    testMembershipIds = [];
  });

  test("shows a checkout failure next to the buy button and keeps the form", async ({ isolatedPage, db }) => {
    const membershipId = crypto.randomUUID();
    testMembershipIds.push(membershipId);
    await db.insert(table.membership).values({
      id: membershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2091, 7, 1),
      endTime: new Date(2092, 6, 31),
      requiresStudentVerification: false,
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }), { waitUntil: "networkidle" });
    await isolatedPage.getByRole("radio", { name: /1\.8\.2091/ }).check();
    await isolatedPage.getByLabel("Perustelut jäsenhakemukselle").fill("Haluan liittyä");

    // Make creating the checkout session throw after the page has loaded
    await db.update(table.membership).set({ stripePriceId: null }).where(eq(table.membership.id, membershipId));
    await isolatedPage.getByRole("button", { name: /osta jäsenyys/i }).click();

    await expect(isolatedPage.getByTestId("pay-membership-error")).toHaveText("Maksuistunnon luominen epäonnistui");
    await expect(isolatedPage).toHaveURL(/\/fi\/new/);
    await expect(isolatedPage.getByLabel("Perustelut jäsenhakemukselle")).toHaveValue("Haluan liittyä");
  });

  test("shows an overlapping membership as a form error", async ({ isolatedPage, isolatedUser, db }) => {
    const membershipId = crypto.randomUUID();
    const overlappingId = crypto.randomUUID();
    testMembershipIds.push(membershipId, overlappingId);
    await db.insert(table.membership).values({
      id: membershipId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2093, 7, 1),
      endTime: new Date(2094, 6, 31),
      requiresStudentVerification: false,
    });

    await isolatedPage.goto(route("/[locale=locale]/new", { locale: "fi" }), { waitUntil: "networkidle" });
    await isolatedPage.getByRole("radio", { name: /1\.8\.2093/ }).check();
    await isolatedPage.getByLabel("Perustelut jäsenhakemukselle").fill("Haluan liittyä");

    // The user gets a membership covering the same period in another tab
    await db.insert(table.membership).values({
      id: overlappingId,
      membershipTypeId,
      stripePriceId: realStripePriceId,
      startTime: new Date(2093, 0, 1),
      endTime: new Date(2094, 11, 31),
      requiresStudentVerification: false,
    });
    await db.insert(table.member).values({
      id: crypto.randomUUID(),
      userId: isolatedUser.id,
      membershipId: overlappingId,
      status: "active",
    });
    await isolatedPage.getByRole("button", { name: /osta jäsenyys/i }).click();

    await expect(isolatedPage.getByTestId("pay-membership-error")).toHaveText(
      "Sinulla on jo jäsenyys tälle ajanjaksolle",
    );
    await expect(isolatedPage).toHaveURL(/\/fi\/new/);
  });
});
