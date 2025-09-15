import { seed, reset } from "drizzle-seed";
import * as table from "./schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { encodeBase32LowerCase } from "@oslojs/encoding";

function generateUserId() {
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	return encodeBase32LowerCase(bytes);
}

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

	const weightedMembershipValues = insertedMemberships.map((insertedMembership, index) => {
		const originalMembershipDetails = membershipsToSeed[index];
		let yearWeight = 0;
		if (originalMembershipDetails.startTime.getFullYear() === 2024) {
			yearWeight = 0.8;
		} else if (originalMembershipDetails.startTime.getFullYear() === 2025) {
			yearWeight = 0.2;
		}

		let typeWeight = 0;
		if (originalMembershipDetails.type === "varsinainen jäsen") {
			typeWeight = 0.9;
		} else if (originalMembershipDetails.type === "ulkojäsen") {
			typeWeight = 0.09;
		} else if (originalMembershipDetails.type === "kannatusjäsen") {
			typeWeight = 0.01;
		}
		return { values: [insertedMembership.id], weight: yearWeight * typeWeight };
	});

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
