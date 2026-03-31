import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$lib/server/env";
import { dev } from "$app/environment";
import * as table from "./schema";
import * as relations from "./relations";

const client = postgres(env.DATABASE_URL, {
  ssl: dev ? undefined : "prefer", // Prefer SSL in production, optional in dev
});

export const dbSchema = { ...table, ...relations } as const;
export type Schema = typeof dbSchema;

export const db = drizzle({ client, schema: dbSchema, casing: "snake_case" });
