import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$env/dynamic/private";
import { dev } from "$app/environment";
import * as schema from "$lib/server/db/schema";
if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const client = postgres(env.DATABASE_URL, {
	ssl: dev ? undefined : "prefer", // Prefer SSL in production, optional in dev
});
export const db = drizzle(client, { schema, casing: "snake_case" });
