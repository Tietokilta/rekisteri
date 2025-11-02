import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations(databaseUrl: string) {
	const migrationClient = postgres(databaseUrl, { max: 1 });
	const db = drizzle(migrationClient, { casing: "snake_case" });

	console.log("Running database migrations...");
	await migrate(db, { migrationsFolder: "./drizzle" });
	console.log("Database migrations completed successfully");

	await migrationClient.end();
}
