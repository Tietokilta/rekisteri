#!/usr/bin/env node

import { seed, reset } from "drizzle-seed";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as table from "./schema";
import { generateUserId } from "../auth/utils";

function date(year: number, monthDay: string) {
  return `${year}-${monthDay}`;
}

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle({ client });

  console.log("Resetting database...");
  const { appCustomization: _appCustomization, ...resetSchema } = table;
  await reset(db, resetSchema);
  console.log("Database reset!");

  const membershipTypes: (typeof table.membershipType.$inferInsert)[] = [
    {
      id: "varsinainen-jasen",
      name: { fi: "Varsinainen jäsen", en: "Regular member" },
      description: {
        fi: "Killan toiminnasta kiinnostuneille Aalto-yliopiston opiskelijoille.",
        en: "For Aalto University students interested in the guild's activities.",
      },
      requiresPayment: true,
      requiresStudentVerification: true,
    },
    {
      id: "ulkojasen",
      name: { fi: "Ulkojäsen", en: "External member" },
      description: {
        fi: "Muille killan toiminnasta kiinnostuneille henkilöille.",
        en: "For other persons interested in the guild's activities.",
      },
      requiresPayment: true,
    },
    {
      id: "alumnijasen",
      name: { fi: "Alumnijäsen", en: "Alumni member" },
      purchasable: false,
      requiresPayment: true,
    },
    {
      id: "kannatusjasen",
      name: { fi: "Kannatusjäsen", en: "Supporting member" },
      requiresPayment: true,
    },
    {
      id: "yhteisojasen",
      name: { fi: "Yhdistysjäsen", en: "Association member" },
      purchasable: false,
      requiresPayment: false,
    },
  ];
  await db.insert(table.membershipType).values(membershipTypes);

  const rootUserId = generateUserId();
  await db.insert(table.user).values({
    id: rootUserId,
    email: "root@tietokilta.fi",
    firstNames: "Veijo",
    lastName: "Tietokilta",
    homeMunicipality: "Espoo",
    preferredLanguage: "unspecified",
    isAllowedEmails: true,
    adminRole: "admin",
  });

  const now = new Date();
  const currentYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const periodDefinitions = [
    { type: "varsinainen-jasen", year: currentYear - 2, price: null },
    { type: "ulkojasen", year: currentYear - 2, price: null },
    { type: "varsinainen-jasen", year: currentYear - 1, price: "price_1R8OQM2a3B4f6jfhOUeOMY74" },
    { type: "ulkojasen", year: currentYear - 1, price: "price_1R8ORJ2a3B4f6jfheqBz7Pwj" },
    { type: "kannatusjasen", year: currentYear - 1, price: "price_1R8ORc2a3B4f6jfh4mtYKiXl" },
    { type: "varsinainen-jasen", year: currentYear, price: "price_1Sqs7c2a3B4f6jfhBiyJfAno" },
    { type: "ulkojasen", year: currentYear, price: "price_1Sqs7y2a3B4f6jfhHjnWzk9n" },
    { type: "kannatusjasen", year: currentYear, price: "price_1Sqs8B2a3B4f6jfhB5Ga6AJC" },
    { type: "varsinainen-jasen", year: currentYear + 1, price: null, draft: true },
    { type: "ulkojasen", year: currentYear + 1, price: null, draft: true },
    { type: "alumnijasen", year: currentYear + 1, price: null, draft: true },
  ] as const;

  const feePeriods: (typeof table.membershipFeePeriod.$inferInsert)[] = periodDefinitions.map((period) => ({
    id: crypto.randomUUID(),
    membershipTypeId: period.type,
    stripePriceId: period.price,
    startDate: date(period.year, "08-01"),
    endDate: date(period.year + 1, "07-31"),
    dueDate: date(period.year, "09-30"),
    nonPaymentActionAt: date(period.year, "12-01"),
    publishedAt: "draft" in period || !period.price ? null : new Date(date(period.year, "08-01")),
    acceptsApplications: !("draft" in period) && period.year === currentYear,
  }));
  const insertedPeriods = await db.insert(table.membershipFeePeriod).values(feePeriods).returning({
    id: table.membershipFeePeriod.id,
    membershipTypeId: table.membershipFeePeriod.membershipTypeId,
    startDate: table.membershipFeePeriod.startDate,
  });
  const currentPeriods = new Map(
    insertedPeriods
      .filter((period) => period.startDate === date(currentYear, "08-01"))
      .map((period) => [period.membershipTypeId, period.id]),
  );

  console.log("Seeding users...");
  await seed(db, { user: table.user }, { count: 1000, version: "3" }).refine((f) => ({
    user: {
      columns: {
        homeMunicipality: f.state(),
        preferredLanguage: f.default({ defaultValue: "unspecified" }),
        adminRole: f.default({ defaultValue: "none" }),
        stripeCustomerId: f.default({ defaultValue: null }),
      },
    },
  }));

  const users = await db.select({ id: table.user.id }).from(table.user);
  const members: (typeof table.member.$inferInsert)[] = [];
  const obligations: (typeof table.membershipObligation.$inferInsert)[] = [];
  const payments: (typeof table.payment.$inferInsert)[] = [];
  const events: (typeof table.membershipEvent.$inferInsert)[] = [];
  const payableTypes = ["varsinainen-jasen", "ulkojasen", "kannatusjasen"] as const;

  for (const user of users) {
    if (user.id === rootUserId) continue;
    const random = Math.random();
    const membershipTypeId = payableTypes[Math.floor(Math.random() * payableTypes.length)] ?? "varsinainen-jasen";
    const feePeriodId = currentPeriods.get(membershipTypeId);
    if (!feePeriodId) throw new Error(`Current period missing for ${membershipTypeId}`);
    const memberId = crypto.randomUUID();
    const startedAt = new Date(date(currentYear - (Math.random() < 0.65 ? 1 : 0), "08-01"));

    if (random < 0.78) {
      members.push({
        id: memberId,
        userId: user.id,
        status: "active",
        membershipTypeId,
        currentMembershipStartedAt: startedAt,
      });
      events.push({
        id: crypto.randomUUID(),
        memberId,
        eventType: "application_approved",
        effectiveAt: startedAt,
        source: "admin",
        certainty: "confirmed",
        actorUserId: rootUserId,
        membershipFeePeriodId: feePeriodId,
        data: { membershipTypeId },
      });
      const obligationId = crypto.randomUUID();
      obligations.push({ id: obligationId, memberId, membershipFeePeriodId: feePeriodId, kind: "renewal" });
      if (Math.random() < 0.72) {
        payments.push({
          id: crypto.randomUUID(),
          memberId,
          membershipFeePeriodId: feePeriodId,
          obligationId,
          source: "imported",
          status: "succeeded",
          paidAt: new Date(date(currentYear, "08-15")),
        });
      }
    } else if (random < 0.86) {
      members.push({
        id: memberId,
        userId: user.id,
        status: "awaiting_payment",
        pendingMembershipTypeId: membershipTypeId,
        applicationMotive: "Seeded application",
      });
    } else if (random < 0.92) {
      members.push({
        id: memberId,
        userId: user.id,
        status: "awaiting_approval",
        pendingMembershipTypeId: membershipTypeId,
        applicationMotive: "Seeded paid application",
      });
      const obligationId = crypto.randomUUID();
      obligations.push({ id: obligationId, memberId, membershipFeePeriodId: feePeriodId, kind: "application" });
      payments.push({
        id: crypto.randomUUID(),
        memberId,
        membershipFeePeriodId: feePeriodId,
        obligationId,
        source: "imported",
        status: "succeeded",
        paidAt: new Date(date(currentYear, "08-15")),
      });
      events.push({
        id: crypto.randomUUID(),
        memberId,
        eventType: "application_submitted",
        effectiveAt: new Date(date(currentYear, "08-15")),
        source: "system",
        certainty: "confirmed",
        membershipFeePeriodId: feePeriodId,
        data: { membershipTypeId },
      });
    } else if (random < 0.97) {
      const endedStartedAt = new Date(date(currentYear - 1, "08-01"));
      const endedAt = new Date(date(currentYear, "01-15"));
      members.push({
        id: memberId,
        userId: user.id,
        status: "ended",
        membershipTypeId,
        currentMembershipStartedAt: endedStartedAt,
        currentMembershipEndedAt: endedAt,
      });
      events.push({
        id: crypto.randomUUID(),
        memberId,
        eventType: "resigned_voluntarily",
        effectiveAt: endedAt,
        source: "admin",
        certainty: "confirmed",
        actorUserId: rootUserId,
        data: { reason: "Seeded resignation" },
      });
    } else {
      members.push({ id: memberId, userId: user.id, status: "rejected", applicationMotive: "Seeded rejection" });
    }
  }

  for (let index = 0; index < members.length; index += 100) {
    await db.insert(table.member).values(members.slice(index, index + 100));
  }
  for (let index = 0; index < obligations.length; index += 100) {
    await db.insert(table.membershipObligation).values(obligations.slice(index, index + 100));
  }
  for (let index = 0; index < payments.length; index += 100) {
    await db.insert(table.payment).values(payments.slice(index, index + 100));
  }
  for (let index = 0; index < events.length; index += 100) {
    await db.insert(table.membershipEvent).values(events.slice(index, index + 100));
  }

  const associationPeriodId = crypto.randomUUID();
  await db.insert(table.membershipFeePeriod).values({
    id: associationPeriodId,
    membershipTypeId: "yhteisojasen",
    startDate: date(currentYear, "08-01"),
    endDate: date(currentYear + 1, "07-31"),
    dueDate: date(currentYear, "09-30"),
    nonPaymentActionAt: date(currentYear, "12-01"),
    publishedAt: new Date(date(currentYear, "08-01")),
  });
  await db.insert(table.member).values([
    {
      id: crypto.randomUUID(),
      organizationName: "Automaatio- ja systeemitekniikan kilta AS ry",
      status: "active",
      membershipTypeId: "yhteisojasen",
      currentMembershipStartedAt: new Date(date(currentYear, "08-01")),
    },
    {
      id: crypto.randomUUID(),
      organizationName: "Sähköinsinöörikilta ry",
      status: "active",
      membershipTypeId: "yhteisojasen",
      currentMembershipStartedAt: new Date(date(currentYear, "08-01")),
    },
  ]);

  console.log(
    `Seeded ${members.length + 2} stable members, ${obligations.length} obligations, and ${payments.length} payments.`,
  );
  await client.end();
} catch (error) {
  console.error("Seeding failed:", error);
  process.exit(1);
}
