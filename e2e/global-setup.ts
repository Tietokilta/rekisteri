import { chromium, type FullConfig } from "@playwright/test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "#lib/server/db/schema.js";
import { relations } from "#lib/server/db/relations.js";
import { hashSessionToken } from "#lib/server/auth/utils.js";
import { encodeBase64url } from "@oslojs/encoding";
import { eq } from "drizzle-orm";
import { execSync, spawn } from "node:child_process";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, Wait } from "testcontainers";
import { loadEnvFile } from "./utils";

type Cleanup = () => unknown;

async function globalSetup(_config: FullConfig) {
  // Stops what setup started, in reverse order, whether setup succeeds or not
  const cleanups: Cleanup[] = [];
  const teardown = async () => {
    for (const cleanup of cleanups.toReversed()) await cleanup();
  };
  try {
    await setUp(cleanups);
  } catch (error) {
    // Report the setup failure, not a cleanup failure it may have caused
    try {
      await teardown();
    } catch (cleanupError) {
      console.error("Cleanup after failed setup failed:", cleanupError);
    }
    throw error;
  }
  return teardown;
}

async function setUp(cleanups: Cleanup[]) {
  loadEnvFile();

  const port = process.env.E2E_PORT;
  if (!port) {
    throw new Error("E2E_PORT not set. It is chosen in playwright.config.ts.");
  }
  const baseURL = `http://localhost:${port}`;

  console.log("✓ Starting test database and Stripe mock containers and building app...");
  const [started, stripeStarted, build] = await Promise.allSettled([
    new PostgreSqlContainer("postgres:17-alpine").start(),
    // Official Stripe API mock, so tests need no Stripe key. It returns fixture
    // data for any ID (e.g. every price is a 20.00 USD "T-shirt").
    new GenericContainer("stripe/stripe-mock:v0.206.0")
      .withExposedPorts(12_111)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
    run("pnpm", ["build"]),
  ]);
  if (started.status === "fulfilled") cleanups.push(() => started.value.stop());
  if (stripeStarted.status === "fulfilled") cleanups.push(() => stripeStarted.value.stop());
  if (started.status === "rejected") throw started.reason;
  if (stripeStarted.status === "rejected") throw stripeStarted.reason;
  if (build.status === "rejected") throw build.reason;
  const container = started.value;
  const stripeApiUrl = `http://${stripeStarted.value.getHost()}:${stripeStarted.value.getMappedPort(12_111)}`;
  const dbUrl = container.getConnectionUri();
  // Inherited by test workers (fixtures read it to access the database directly)
  process.env.DATABASE_URL_TEST = dbUrl;

  console.log("✓ Running migrations on test database...");
  execSync(`DATABASE_URL="${dbUrl}" pnpm db:migrate`, { stdio: "inherit" });

  console.log("✓ Seeding test database...");
  execSync(`DATABASE_URL="${dbUrl}" pnpm tsx --env-file=.env src/lib/server/db/seed.ts`, {
    stdio: "inherit",
  });

  const client = postgres(dbUrl);
  const db = drizzle({ client, relations });

  const [adminUser] = await db.select().from(table.user).where(eq(table.user.email, "root@tietokilta.fi")).limit(1);
  const [appCustomization] = await db
    .select({ id: table.appCustomization.id })
    .from(table.appCustomization)
    .where(eq(table.appCustomization.id, 1))
    .limit(1);

  if (!adminUser) {
    throw new Error("Failed to seed admin user");
  }
  if (!appCustomization) {
    throw new Error("Failed to migrate app customization singleton");
  }

  const sessionToken = generateSessionToken();
  const sessionId = hashSessionToken(sessionToken);
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
    adminRole: adminUser.adminRole,
  };
  const fs = await import("node:fs");
  fs.writeFileSync("e2e/.auth/admin-user.json", JSON.stringify(userInfo, null, 2));

  // Create readonly admin user and session
  const readonlyEmail = "readonly@tietokilta.fi";

  let readonlyUser = await db.query.user.findFirst({
    where: { email: readonlyEmail },
  });

  if (!readonlyUser) {
    const [newUser] = await db
      .insert(table.user)
      .values({
        id: crypto.randomUUID(),
        email: readonlyEmail,
        adminRole: "readonly",
        firstNames: "Read",
        lastName: "Only",
      })
      .returning();
    if (!newUser) {
      throw new Error("Failed to create readonly admin user");
    }
    readonlyUser = newUser;
    console.log("✓ Created readonly admin user");
  } else if (readonlyUser.adminRole !== "readonly") {
    // Ensure the user has readonly role
    await db.update(table.user).set({ adminRole: "readonly" }).where(eq(table.user.id, readonlyUser.id));
    readonlyUser = { ...readonlyUser, adminRole: "readonly" as const };
  }

  // Create session for readonly admin
  const readonlySessionToken = generateSessionToken();
  const readonlySessionId = hashSessionToken(readonlySessionToken);
  const readonlyExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await db.insert(table.session).values({
    id: readonlySessionId,
    userId: readonlyUser.id,
    expiresAt: readonlyExpiresAt,
  });

  const readonlyContext = await browser.newContext();
  await readonlyContext.addCookies([
    {
      name: "auth-session",
      value: readonlySessionToken,
      domain: "localhost",
      path: "/",
      expires: Math.floor(readonlyExpiresAt.getTime() / 1000),
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  await readonlyContext.storageState({ path: "e2e/.auth/readonly.json" });

  // Write readonly user info
  const readonlyUserInfo = {
    id: readonlyUser.id,
    email: readonlyUser.email,
    adminRole: readonlyUser.adminRole,
  };
  fs.writeFileSync("e2e/.auth/readonly-user.json", JSON.stringify(readonlyUserInfo, null, 2));

  await readonlyContext.close();
  await browser.close();
  await client.end();

  console.log("✓ Created authenticated admin and readonly admin sessions for tests");

  console.log(`✓ Starting app server on ${baseURL}...`);
  // Vite directly rather than `pnpm preview`, so there's no wrapper process to
  // outlive a kill. It stays in Playwright's process group, so Ctrl-C reaches it.
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", port, "--strictPort"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      STRIPE_API_URL: stripeApiUrl,
      STRIPE_API_KEY: "sk_test_mock",
      UNSAFE_DISABLE_RATE_LIMITS: "true",
      TEST: "true",
      PUBLIC_URL: baseURL,
      // WebAuthn/Passkey configuration for test environment
      RP_ORIGIN: baseURL,
      RP_ID: "localhost",
      RP_NAME: "Tietokilta Rekisteri",
      OIDC_ENABLED: "true",
    },
  });
  cleanups.push(() => server.kill());

  await waitForServer(baseURL, server);
  console.log("✓ App server ready");
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`)),
    );
  });
}

// Polls the root URL rather than /api/health, which also checks SMTP and can
// hang on the placeholder SMTP host from .env.example
async function waitForServer(url: string, server: ReturnType<typeof spawn>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`App server exited with code ${server.exitCode}`);
    }
    try {
      await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`App server did not respond at ${url} within ${timeoutMs / 1000}s`);
}

function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return encodeBase64url(bytes);
}

export default globalSetup;
