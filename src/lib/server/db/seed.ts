import { seed, reset } from "drizzle-seed";
import * as table from "./schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateUserId } from "../auth/utils";

async function main() {
	if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

	const client = postgres(process.env.DATABASE_URL);
	const db = drizzle(client, { schema: table, casing: "snake_case" });

	console.log("Resetting database...");
	await reset(db, { user: table.user, membership: table.membership, member: table.member });
	console.log("Database reset!");

	console.log("Seeding database...");

	await db.insert(table.user).values({
		id: generateUserId(),
		email: "root@tietokilta.fi",
		firstNames: "Veijo",
		lastName: "Tietokilta",
		homeMunicipality: "Espoo",
		isAllowedEmails: true,
		isAdmin: true,
	});

	const membershipsToSeed = [
		// 2022-2023 period (expired)
		{
			id: generateUserId(),
			type: "varsinainen jäsen",
			stripePriceId: "price_1R8OQM2a3B4f6jfhOUeOMY74",
			startTime: new Date("2022-08-01"),
			endTime: new Date("2023-07-31"),
			priceCents: 700,
			requiresStudentVerification: true,
		},
		{
			id: generateUserId(),
			type: "ulkojäsen",
			stripePriceId: "price_1R8ORJ2a3B4f6jfheqBz7Pwj",
			startTime: new Date("2022-08-01"),
			endTime: new Date("2023-07-31"),
			priceCents: 700,
			requiresStudentVerification: false,
		},
		// 2023-2024 period (expired)
		{
			id: generateUserId(),
			type: "varsinainen jäsen",
			stripePriceId: "price_1R8OQM2a3B4f6jfhOUeOMY74",
			startTime: new Date("2023-08-01"),
			endTime: new Date("2024-07-31"),
			priceCents: 700,
			requiresStudentVerification: true,
		},
		{
			id: generateUserId(),
			type: "ulkojäsen",
			stripePriceId: "price_1R8ORJ2a3B4f6jfheqBz7Pwj",
			startTime: new Date("2023-08-01"),
			endTime: new Date("2024-07-31"),
			priceCents: 700,
			requiresStudentVerification: false,
		},
		// 2024-2025 period (expired)
		{
			id: generateUserId(),
			type: "varsinainen jäsen",
			stripePriceId: "price_1R8OQM2a3B4f6jfhOUeOMY74",
			startTime: new Date("2024-08-01"),
			endTime: new Date("2025-07-31"),
			priceCents: 700,
			requiresStudentVerification: true,
		},
		{
			id: generateUserId(),
			type: "ulkojäsen",
			stripePriceId: "price_1R8ORJ2a3B4f6jfheqBz7Pwj",
			startTime: new Date("2024-08-01"),
			endTime: new Date("2025-07-31"),
			priceCents: 700,
			requiresStudentVerification: false,
		},
		{
			id: generateUserId(),
			type: "kannatusjäsen",
			stripePriceId: "price_1R8ORc2a3B4f6jfh4mtYKiXl",
			startTime: new Date("2024-08-01"),
			endTime: new Date("2025-07-31"),
			priceCents: 5000,
			requiresStudentVerification: false,
		},
		// 2025-2026 period (current)
		{
			id: generateUserId(),
			type: "varsinainen jäsen",
			stripePriceId: "price_1R8OQM2a3B4f6jfhOUeOMY74",
			startTime: new Date("2025-08-01"),
			endTime: new Date("2026-07-31"),
			priceCents: 700,
			requiresStudentVerification: true,
		},
		{
			id: generateUserId(),
			type: "ulkojäsen",
			stripePriceId: "price_1R8ORJ2a3B4f6jfheqBz7Pwj",
			startTime: new Date("2025-08-01"),
			endTime: new Date("2026-07-31"),
			priceCents: 700,
			requiresStudentVerification: false,
		},
		{
			id: generateUserId(),
			type: "kannatusjäsen",
			stripePriceId: "price_1R8ORc2a3B4f6jfh4mtYKiXl",
			startTime: new Date("2025-08-01"),
			endTime: new Date("2026-07-31"),
			priceCents: 5000,
			requiresStudentVerification: false,
		},
	];

	const insertedMemberships = await db
		.insert(table.membership)
		.values(membershipsToSeed)
		.returning({ id: table.membership.id });

	// Direct weights for each membership (must sum to 1.0)
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
	];

	const weightedMembershipValues = insertedMemberships.map((insertedMembership, index) => ({
		values: [insertedMembership.id],
		weight: weights[index],
	}));

	console.log("Seeding users and members using drizzle-seed...");
	await seed(db, { user: table.user, member: table.member }, { count: 1000, version: "2" }).refine((f) => ({
		user: {
			columns: {
				homeMunicipality: f.state(),
				isAdmin: f.default({ defaultValue: false }),
				stripeCustomerId: f.default({ defaultValue: null }),
			},
			with: {
				member: [
					{
						weight: 0.5,
						count: 1,
					},
					{
						weight: 0.5,
						count: 2,
					},
				],
			},
		},
		member: {
			columns: {
				membershipId: f.valuesFromArray({ values: weightedMembershipValues }),
				status: f.valuesFromArray({
					values: [
						{ values: ["awaiting_approval"], weight: 0.02 },
						{ values: ["awaiting_payment"], weight: 0.01 },
						{ values: ["expired"], weight: 0.0 },
						{ values: ["cancelled"], weight: 0.01 },
						{ values: ["active"], weight: 0.96 },
					],
				}),
			},
		},
	}));

	console.log("Database seeded!");

	await client.end();
}

main().catch((e) => {
	console.error("Seeding failed:", e);
	process.exit(1);
});
