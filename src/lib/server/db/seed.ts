#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { seed, reset } from "drizzle-seed";
import * as table from "./schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateUserId } from "../auth/utils";

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client, { schema: table, casing: "snake_case" });

  console.log("Resetting database...");
  await reset(db, {
    user: table.user,
    membership: table.membership,
    member: table.member,
    membershipType: table.membershipType,
  });
  console.log("Database reset!");

  console.log("Seeding database...");

  // Seed membership types first
  const membershipTypesToSeed = [
    {
      id: "varsinainen-jasen",
      name: { fi: "Varsinainen jäsen", en: "Regular member" },
      description: {
        fi: "Killan toiminnasta kiinnostuneille henkilöille, joilla on tutkintoon johtava opiskeluoikeus tai vaihto-opinto-oikeus Aalto-yliopistossa.",
        en: "For persons interested in the guild's activities who have a right to study leading to a degree or a right to complete exchange studies at Aalto University.",
      },
    },
    {
      id: "ulkojasen",
      name: { fi: "Ulkojäsen", en: "External member" },
      description: {
        fi: "Killan toiminnasta kiinnostuneille henkilöille, jotka ovat suorittaneet toisen asteen tutkinnon tai joilla on tutkintoon johtava opinto-oikeus toisessa korkeakoulussa.",
        en: "For persons interested in the guild's activities who have completed an upper secondary qualification or have a right to study leading to a degree at another higher education institution.",
      },
    },
    {
      id: "alumnijasen",
      name: { fi: "Alumnijäsen", en: "Alumni member" },
      description: {
        fi: "Henkilöille, joilla on aiemmin ollut tutkintoon johtava opiskeluoikeus korkeakoulussa.",
        en: "For persons who previously had a right to study leading to a degree at a higher education institution.",
      },
    },
    {
      id: "kannatusjasen",
      name: { fi: "Kannatusjäsen", en: "Supporting member" },
      description: {
        fi: "Killan toimintaa tukeville henkilöille tai oikeushenkilöille.",
        en: "For persons or legal entities supporting the guild's activities.",
      },
    },
  ];

  await db.insert(table.membershipType).values(membershipTypesToSeed);
  console.log("Seeded membership types!");

  const rootUserId = generateUserId();
  await db.insert(table.user).values({
    id: rootUserId,
    email: "root@tietokilta.fi",
    firstNames: "Veijo",
    lastName: "Tietokilta",
    homeMunicipality: "Espoo",
    preferredLanguage: "unspecified",
    isAllowedEmails: true,
    isAdmin: true,
  });

  const membershipsToSeed = [
    // 2022-2023 period (expired, legacy - no Stripe price)
    {
      id: crypto.randomUUID(),
      membershipTypeId: "varsinainen-jasen",
      stripePriceId: null,
      startTime: new Date("2022-08-01"),
      endTime: new Date("2023-07-31"),
      requiresStudentVerification: true,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "ulkojasen",
      stripePriceId: null,
      startTime: new Date("2022-08-01"),
      endTime: new Date("2023-07-31"),
      requiresStudentVerification: false,
    },
    // 2023-2024 period (expired, legacy - no Stripe price)
    {
      id: crypto.randomUUID(),
      membershipTypeId: "varsinainen-jasen",
      stripePriceId: null,
      startTime: new Date("2023-08-01"),
      endTime: new Date("2024-07-31"),
      requiresStudentVerification: true,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "ulkojasen",
      stripePriceId: null,
      startTime: new Date("2023-08-01"),
      endTime: new Date("2024-07-31"),
      requiresStudentVerification: false,
    },
    // 2024-2025 period (with Stripe prices)
    {
      id: crypto.randomUUID(),
      membershipTypeId: "varsinainen-jasen",
      stripePriceId: "price_1R8OQM2a3B4f6jfhOUeOMY74",
      startTime: new Date("2024-08-01"),
      endTime: new Date("2025-07-31"),
      requiresStudentVerification: true,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "ulkojasen",
      stripePriceId: "price_1R8ORJ2a3B4f6jfheqBz7Pwj",
      startTime: new Date("2024-08-01"),
      endTime: new Date("2025-07-31"),
      requiresStudentVerification: false,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "kannatusjasen",
      stripePriceId: "price_1R8ORc2a3B4f6jfh4mtYKiXl",
      startTime: new Date("2024-08-01"),
      endTime: new Date("2025-07-31"),
      requiresStudentVerification: false,
    },
    // 2025-2026 period (current, with Stripe prices)
    {
      id: crypto.randomUUID(),
      membershipTypeId: "varsinainen-jasen",
      stripePriceId: "price_1Sqs7c2a3B4f6jfhBiyJfAno",
      startTime: new Date("2025-08-01"),
      endTime: new Date("2026-07-31"),
      requiresStudentVerification: true,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "ulkojasen",
      stripePriceId: "price_1Sqs7y2a3B4f6jfhHjnWzk9n",
      startTime: new Date("2025-08-01"),
      endTime: new Date("2026-07-31"),
      requiresStudentVerification: false,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "kannatusjasen",
      stripePriceId: "price_1Sqs8B2a3B4f6jfhB5Ga6AJC",
      startTime: new Date("2025-08-01"),
      endTime: new Date("2026-07-31"),
      requiresStudentVerification: false,
    },
    // 2026-2027 period (upcoming, no Stripe prices yet, no members seeded)
    // Note: Kannatusjäsen replaced by Alumnijäsen starting this period
    {
      id: crypto.randomUUID(),
      membershipTypeId: "varsinainen-jasen",
      stripePriceId: null,
      startTime: new Date("2026-08-01"),
      endTime: new Date("2027-07-31"),
      requiresStudentVerification: true,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "ulkojasen",
      stripePriceId: null,
      startTime: new Date("2026-08-01"),
      endTime: new Date("2027-07-31"),
      requiresStudentVerification: false,
    },
    {
      id: crypto.randomUUID(),
      membershipTypeId: "alumnijasen",
      stripePriceId: null,
      startTime: new Date("2026-08-01"),
      endTime: new Date("2027-07-31"),
      requiresStudentVerification: false,
    },
  ];

  const insertedMemberships = await db
    .insert(table.membership)
    .values(membershipsToSeed)
    .returning({ id: table.membership.id, endTime: table.membership.endTime });

  // Direct weights for each membership (must sum to 1.0 for memberships that should have members)
  const weights = [
    0.045, // 2022 varsinainen (5% of users * 90% varsinainen)
    0.005, // 2022 ulkojäsen (5% of users * 10% ulkojäsen)
    0.135, // 2023 varsinainen (15% of users * 90% varsinainen)
    0.015, // 2023 ulkojäsen (15% of users * 10% ulkojäsen)
    0.27, // 2024 varsinainen (30% of users * 90% varsinainen)
    0.027, // 2024 ulkojäsen (30% of users * 9% ulkojäsen)
    0.003, // 2024 kannatusjäsen (30% of users * 1% kannatusjäsen)
    0.45, // 2025 varsinainen (50% of users * 90% varsinainen)
    0.045, // 2025 ulkojäsen (50% of users * 9% ulkojäsen)
    0.005, // 2025 kannatusjäsen (50% of users * 1% kannatusjäsen)
    // 2026-2027 memberships - no members seeded (upcoming period)
    0, // 2026 varsinainen
    0, // 2026 ulkojäsen
    0, // 2026 alumnijäsen
  ];

  // Seed users only first
  console.log("Seeding users...");
  await seed(db, { user: table.user }, { count: 1000, version: "2" }).refine((f) => ({
    user: {
      columns: {
        homeMunicipality: f.state(),
        preferredLanguage: f.default({ defaultValue: "unspecified" }),
        isAdmin: f.default({ defaultValue: false }),
        stripeCustomerId: f.default({ defaultValue: null }),
      },
    },
  }));

  // Get all seeded users
  const allUsers = await db.select({ id: table.user.id }).from(table.user);

  console.log("Seeding members with unique memberships per user...");

  // Helper to select weighted random membership
  function selectWeightedMembership(exclude?: string): string {
    const random = Math.random();
    let cumulativeWeight = 0;

    for (let i = 0; i < insertedMemberships.length; i++) {
      // Skip if this is the excluded membership
      if (exclude && insertedMemberships[i]!.id === exclude) continue;

      cumulativeWeight += weights[i]!;
      if (random <= cumulativeWeight) {
        return insertedMemberships[i]!.id;
      }
    }
    return insertedMemberships.at(-1)!.id;
  }

  // Helper to select status based on membership period
  function selectStatus(
    membershipId: string,
  ): "awaiting_payment" | "awaiting_approval" | "active" | "resigned" | "rejected" {
    const membership = insertedMemberships.find((m) => m.id === membershipId);
    if (!membership) return "active";

    const now = new Date();
    const isPast = membership.endTime < now;

    if (isPast) {
      // For past memberships, mostly resigned with small chance of rejected
      const random = Math.random();
      if (random < 0.05) return "rejected";
      return "resigned";
    } else {
      // For current/future memberships, use normal distribution
      const random = Math.random();
      if (random < 0.02) return "awaiting_approval";
      if (random < 0.03) return "awaiting_payment";
      if (random < 0.04) return "rejected";
      return "active";
    }
  }

  // Create members for each user
  const membersToInsert = [];
  for (const user of allUsers) {
    // Skip the root admin user
    if (user.id === rootUserId) continue;

    // 50% chance of 1 membership, 50% chance of 2 memberships
    const membershipCount = Math.random() < 0.5 ? 1 : 2;

    // First membership
    const firstMembershipId = selectWeightedMembership();
    membersToInsert.push({
      id: crypto.randomUUID(),
      userId: user.id,
      membershipId: firstMembershipId,
      status: selectStatus(firstMembershipId),
      stripeSessionId: null,
    });

    // Second membership (if applicable) - ensure it's different
    if (membershipCount === 2) {
      const secondMembershipId = selectWeightedMembership(firstMembershipId);
      membersToInsert.push({
        id: crypto.randomUUID(),
        userId: user.id,
        membershipId: secondMembershipId,
        status: selectStatus(secondMembershipId),
        stripeSessionId: null,
      });
    }
  }

  // Insert all members in batches
  const batchSize = 100;
  for (let i = 0; i < membersToInsert.length; i += batchSize) {
    const batch = membersToInsert.slice(i, i + batchSize);
    await db.insert(table.member).values(batch);
  }

  console.log(`Seeded ${membersToInsert.length} member records for ${allUsers.length - 1} users!`);

  await client.end();
} catch (e) {
  console.error("Seeding failed:", e);
  process.exit(1);
}
