import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$lib/server/env";
import { dev } from "$app/environment";
import * as schema from "$lib/server/db/schema";

const client = postgres(env.DATABASE_URL, {
	ssl: dev ? undefined : "prefer", // Prefer SSL in production, optional in dev
});
export const db = drizzle(client, { schema, casing: "snake_case" });
