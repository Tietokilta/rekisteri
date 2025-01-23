import { seed, reset } from "drizzle-seed";
import { user } from "./schema";
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
	const db = drizzle(client);

	console.log("Resetting database...");
	await reset(db, { user });
	console.log("Database reset!");

	console.log("Seeding database...");

	await db.insert(user).values({
		id: generateUserId(),
		email: "root@tietokilta.fi",
		isAdmin: true,
	});

	await seed(db, { user }, { count: 1000 }).refine((f) => ({
		user: {
			columns: {
				isAdmin: f.default({ defaultValue: false }),
			},
		},
	}));

	console.log("Database seeded!");

	await client.end();
}

main();
