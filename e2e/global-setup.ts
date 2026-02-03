import { chromium, type FullConfig } from "@playwright/test";
import * as table from "../src/lib/server/db/schema";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { eq } from "drizzle-orm";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createTestDatabase, saveContainerState } from "./testcontainer";

async function globalSetup(_config: FullConfig) {
  console.log("✓ Global setup starting...");

  try {
    // Start PostgreSQL container and run migrations
    const testDb = await createTestDatabase();
    const { db, container, connectionUri, client } = testDb;

    // Save container state for teardown and fixtures
    saveContainerState(container.getId(), connectionUri);

    // Seed the database
    console.log("✓ Seeding test database...");
    execSync(`DATABASE_URL="${connectionUri}" pnpm tsx --env-file=.env src/lib/server/db/seed.ts`, {
      stdio: "inherit",
    });

    // Get the admin user
    const [adminUser] = await db.select().from(table.user).where(eq(table.user.email, "root@tietokilta.fi")).limit(1);

    if (!adminUser) {
      throw new Error("Failed to seed admin user");
    }

    // Create admin session
    const sessionToken = generateSessionToken();
    const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)));
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await db.insert(table.session).values({
      id: sessionId,
      userId: adminUser.id,
      expiresAt,
    });

    // Create browser context and save storage state
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

    // Ensure auth directory exists
    const authDir = "e2e/.auth";
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    await context.storageState({ path: "e2e/.auth/admin.json" });

    // Write admin user info to a file for the auth fixture to read
    const userInfo = {
      id: adminUser.id,
      email: adminUser.email,
      isAdmin: adminUser.isAdmin,
    };
    fs.writeFileSync("e2e/.auth/admin-user.json", JSON.stringify(userInfo, null, 2));

    await browser.close();
    await client.end();

    console.log("✓ Created authenticated admin session for tests");
    console.log(`✓ Test container running on: ${connectionUri}`);
  } catch (error) {
    console.error("✗ Global setup failed:", error);
    throw error;
  }
}

function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return encodeBase64url(bytes);
}

export default globalSetup;
