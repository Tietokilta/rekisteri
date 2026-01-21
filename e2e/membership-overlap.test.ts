import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";
import { generateUserId } from "../src/lib/server/auth/utils";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";
import { loadEnvFile } from "./utils";

// Load env for DATABASE_URL_TEST
loadEnvFile();

type TestFixtures = {
	testUser: { id: string; email: string };
	testPage: Page;
	testContext: BrowserContext;
	db: PostgresJsDatabase<typeof table>;
};

type WorkerFixtures = {
	dbConnection: {
		client: ReturnType<typeof postgres>;
		db: PostgresJsDatabase<typeof table>;
	};
};

/**
 * Custom test fixture that creates an isolated user for each test
 */
const test = base.extend<TestFixtures, WorkerFixtures>({
	dbConnection: [
		// eslint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const dbUrl = process.env.DATABASE_URL_TEST;
			if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");

			const client = postgres(dbUrl);
			const db = drizzle(client, { schema: table, casing: "snake_case" });

			await use({ client, db });

			await client.end();
		},
		{ scope: "worker" },
	],

	db: async ({ dbConnection }, use) => {
		await use(dbConnection.db);
	},

	testUser: async ({ db }, use, testInfo) => {
		// Create a unique user for this test
		const userId = generateUserId();
		const email = `test-overlap-${testInfo.workerIndex}-${crypto.randomUUID()}@example.com`;

		await db.insert(table.user).values({
			id: userId,
			email,
			firstNames: "Test",
			lastName: "User",
			homeMunicipality: "Helsinki",
			preferredLanguage: "finnish",
			isAllowedEmails: false,
			isAdmin: false,
		});

		await use({ id: userId, email });

		// Cleanup: delete user's members, then user
		await db.delete(table.member).where(eq(table.member.userId, userId));
		await db.delete(table.session).where(eq(table.session.userId, userId));
		await db.delete(table.user).where(eq(table.user.id, userId));
	},

	testContext: async ({ browser, db, testUser }, use) => {
		// Create a session for the test user
		const sessionToken = encodeBase64url(crypto.getRandomValues(new Uint8Array(18)));
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)));
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 1 day

		await db.insert(table.session).values({
			id: sessionId,
			userId: testUser.id,
			expiresAt,
		});

		// Create browser context with auth cookie
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

		await use(context);

		await context.close();
	},

	testPage: async ({ testContext }, use) => {
		const page = await testContext.newPage();
		await use(page);
	},
});

// Use existing membership type from seed data
const membershipTypeId = "ulkojasen"; // External member - no student verification required

test.describe("Membership Overlap Blocking", () => {
	test("shows membership when user has no blocking memberships for that period", async ({ testPage, db }) => {
		// Create a test membership for a far future period
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_visible_${crypto.randomUUID()}`,
			startTime: new Date(2050, 7, 1),
			endTime: new Date(2051, 6, 31),
			requiresStudentVerification: false,
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// Verify the membership is shown (date format: d.M.yyyy in Finnish)
		await expect(testPage.getByText(/1\.8\.2050/)).toBeVisible();
	});

	test("hides membership when user has active membership for same period", async ({ testPage, testUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_active_${crypto.randomUUID()}`,
			startTime: new Date(2051, 7, 1),
			endTime: new Date(2052, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an active member record for the test user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: testMembershipId,
			status: "active",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// Verify the membership is NOT shown (blocked by active membership)
		await expect(testPage.getByText(/1\.8\.2051/)).not.toBeVisible();
	});

	test("shows membership when user has cancelled membership for same period", async ({ testPage, testUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_cancelled_${crypto.randomUUID()}`,
			startTime: new Date(2052, 7, 1),
			endTime: new Date(2053, 6, 31),
			requiresStudentVerification: false,
		});

		// Create a cancelled member record for the test user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: testMembershipId,
			status: "cancelled",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// Verify the membership IS shown (cancelled memberships don't block)
		await expect(testPage.getByText(/1\.8\.2052/)).toBeVisible();
	});

	test("shows membership when user has expired membership for same period", async ({ testPage, testUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_expired_${crypto.randomUUID()}`,
			startTime: new Date(2053, 7, 1),
			endTime: new Date(2054, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an expired member record for the test user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: testMembershipId,
			status: "expired",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// Verify the membership IS shown (expired memberships don't block)
		await expect(testPage.getByText(/1\.8\.2053/)).toBeVisible();
	});

	test("hides membership when user has awaiting_payment membership for same period", async ({
		testPage,
		testUser,
		db,
	}) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_awaiting_payment_${crypto.randomUUID()}`,
			startTime: new Date(2054, 7, 1),
			endTime: new Date(2055, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an awaiting_payment member record for the test user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: testMembershipId,
			status: "awaiting_payment",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// Verify the membership is NOT shown (awaiting_payment blocks)
		await expect(testPage.getByText(/1\.8\.2054/)).not.toBeVisible();
	});

	test("hides membership when user has awaiting_approval membership for same period", async ({
		testPage,
		testUser,
		db,
	}) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_awaiting_approval_${crypto.randomUUID()}`,
			startTime: new Date(2055, 7, 1),
			endTime: new Date(2056, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an awaiting_approval member record for the test user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: testMembershipId,
			status: "awaiting_approval",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// Verify the membership is NOT shown (awaiting_approval blocks)
		await expect(testPage.getByText(/1\.8\.2055/)).not.toBeVisible();
	});

	test("blocks future memberships when user has active membership ending later", async ({ testPage, testUser, db }) => {
		// Create current membership (2070-2072) - user has this active
		const currentMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: currentMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_current_blocking_${crypto.randomUUID()}`,
			startTime: new Date(2070, 7, 1),
			endTime: new Date(2072, 6, 31), // Ends in July 2072
			requiresStudentVerification: false,
		});

		// Future membership (2071-2072) - starts before current ends
		await db.insert(table.membership).values({
			id: crypto.randomUUID(),
			membershipTypeId,
			stripePriceId: `price_test_overlap_future_blocked_${crypto.randomUUID()}`,
			startTime: new Date(2071, 7, 1), // Starts August 2071, before July 2072 end
			endTime: new Date(2072, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an active member record for the current membership
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: currentMembershipId,
			status: "active",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// The future membership (2071-2072) should be blocked because its start time
		// is before the active membership's end time (July 2072)
		await expect(testPage.getByText(/1\.8\.2071/)).not.toBeVisible();
	});

	test("allows future memberships when they start after active membership ends", async ({ testPage, testUser, db }) => {
		// Current membership (2080-2081)
		const currentMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: currentMembershipId,
			membershipTypeId,
			stripePriceId: `price_test_overlap_current_nonblocking_${crypto.randomUUID()}`,
			startTime: new Date(2080, 7, 1),
			endTime: new Date(2081, 6, 31), // Ends July 2081
			requiresStudentVerification: false,
		});

		// Future membership (2081-2082) - starts exactly when current ends
		await db.insert(table.membership).values({
			id: crypto.randomUUID(),
			membershipTypeId,
			stripePriceId: `price_test_overlap_future_allowed_${crypto.randomUUID()}`,
			startTime: new Date(2081, 7, 1), // Starts August 2081, after July 2081 end
			endTime: new Date(2082, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an active member record for the current membership
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: testUser.id,
			membershipId: currentMembershipId,
			status: "active",
		});

		await testPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await testPage.waitForLoadState("networkidle");

		// The future membership (2081-2082) should be available because it starts
		// on or after the active membership ends
		await expect(testPage.getByText(/1\.8\.2081/)).toBeVisible();
	});
});

export { expect };
