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

	await seed(
		db,
		{ user: table.user, member: table.member, membership: table.membership },
		{ count: 1000, version: "2" },
	).refine((f) => ({
		membership: {
			count: 3,
			columns: {
				type: f.valuesFromArray({ values: ["varsinainen jäsen", "ulkojäsen", "kannatusjäsen"], isUnique: true }),
				startTime: f.default({ defaultValue: new Date("2024-08-01") }),
				endTime: f.default({ defaultValue: new Date("2025-07-31") }),
				priceCents: f.valuesFromArray({ values: [700, 5000] }),
			},
		},
		user: {
			columns: {
				homeMunicipality: f.state(),
				isAdmin: f.default({ defaultValue: false }),
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
	}));

	console.log("Database seeded!");

	await client.end();
}

main();
