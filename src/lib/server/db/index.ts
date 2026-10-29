import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "#lib/server/env.js";
import { dev } from "$app/env";
import { relations } from "./relations";

const client = postgres(env.DATABASE_URL, {
  ssl: dev ? undefined : "prefer", // Prefer SSL in production, optional in dev
});

export type Schema = typeof relations;

export const db = drizzle({ client, relations });
