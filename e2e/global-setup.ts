import { chromium, type FullConfig } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { eq } from "drizzle-orm";
import { execSync } from "node:child_process";
import { loadEnvFile } from "./utils";

async function globalSetup(_config: FullConfig) {
	loadEnvFile();

	const dbUrl = process.env.DATABASE_URL_TEST;
	if (!dbUrl) {
		throw new Error("DATABASE_URL_TEST not set. Make sure .env file exists with DATABASE_URL_TEST.");
	}

	const url = new URL(dbUrl);
	const testDbName = url.pathname.slice(1);

	const baseDbUrl = new URL(dbUrl);
	baseDbUrl.pathname = "/postgres";
	const adminClient = postgres(baseDbUrl.toString());

	try {
		const result = await adminClient`SELECT 1 FROM pg_database WHERE datname = ${testDbName}`;
		if (result.length === 0) {
			await adminClient.unsafe(`CREATE DATABASE ${testDbName}`);
			console.log(`✓ Created test database: ${testDbName}`);
		}
	} finally {
		await adminClient.end();
	}

	const client = postgres(dbUrl);
	const db = drizzle(client, { schema: table, casing: "snake_case" });

	console.log("✓ Pushing schema to test database...");
	execSync(`DATABASE_URL="${dbUrl}" pnpm drizzle-kit push --force`, { stdio: "inherit" });

	let [adminUser] = await db.select().from(table.user).where(eq(table.user.email, "root@tietokilta.fi")).limit(1);

	if (!adminUser) {
		console.log("✓ Seeding test database...");
		execSync(`DATABASE_URL="${dbUrl}" pnpm tsx --env-file=.env src/lib/server/db/seed.ts`, {
			stdio: "inherit",
		});
		[adminUser] = await db.select().from(table.user).where(eq(table.user.email, "root@tietokilta.fi")).limit(1);
		if (!adminUser) {
			throw new Error("Failed to seed admin user");
		}
	}

	const sessionToken = generateSessionToken();
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)));
	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

	await db.insert(table.session).values({
		id: sessionId,
		userId: adminUser.id,
		expiresAt,
	});

	const browser = await chromium.launch();
	const context = await browser.newContext();

	await context.addCookies([
		{
			name: "auth-session",
			value: sessionToken,
			domain: "localhost",
			path: "/",
			expires: Math.floor(expiresAt.getTime() / 1000),
			httpOnly: false,
			secure: false,
			sameSite: "Lax",
		},
	]);

	await context.storageState({ path: "e2e/.auth/admin.json" });

	// Write admin user info to a file for the auth fixture to read
	const userInfo = {
		id: adminUser.id,
		email: adminUser.email,
		isAdmin: adminUser.isAdmin,
	};
	const fs = await import("node:fs");
	fs.writeFileSync("e2e/.auth/admin-user.json", JSON.stringify(userInfo, null, 2));

	await browser.close();
	await client.end();

	console.log("✓ Created authenticated admin session for tests");
}

function generateSessionToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	return encodeBase64url(bytes);
}

export default globalSetup;
