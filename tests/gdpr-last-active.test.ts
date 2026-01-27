import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase, stopTestDatabase, type TestDatabase } from "./utils/db";
import * as table from "../src/lib/server/db/schema";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase64url, encodeHexLowerCase } from "@oslojs/encoding";

function generateSessionToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	return encodeBase64url(bytes);
}

describe("GDPR - lastActiveAt trigger", () => {
	let testDb: TestDatabase;

	beforeAll(async () => {
		testDb = await createTestDatabase();
	}, 120_000); // 2 min timeout for container startup

	afterAll(async () => {
		await stopTestDatabase(testDb);
	});

	it("should update lastActiveAt when a session is inserted", async () => {
		const { db } = testDb;

		// Create a test user with null lastActiveAt
		const userId = crypto.randomUUID();
		const testEmail = `test-insert-${userId}@example.com`;

		await db.insert(table.user).values({
			id: userId,
			email: testEmail,
			isAdmin: false,
			lastActiveAt: null,
		});

		// Verify lastActiveAt is null initially
		const [userBefore] = await db
			.select({ lastActiveAt: table.user.lastActiveAt })
			.from(table.user)
			.where(eq(table.user.id, userId));
		expect(userBefore).toBeDefined();
		expect(userBefore?.lastActiveAt).toBeNull();

		// Create a session - this should trigger the lastActiveAt update
		const sessionToken = generateSessionToken();
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)));
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

		await db.insert(table.session).values({
			id: sessionId,
			userId: userId,
			expiresAt,
		});

		// Verify lastActiveAt was updated by the trigger
		const [userAfter] = await db
			.select({ lastActiveAt: table.user.lastActiveAt })
			.from(table.user)
			.where(eq(table.user.id, userId));

		expect(userAfter).toBeDefined();
		expect(userAfter?.lastActiveAt).not.toBeNull();
		// Should be within the last 5 seconds
		expect(userAfter?.lastActiveAt?.getTime()).toBeGreaterThan(Date.now() - 5000);
	});

	it("should update lastActiveAt when a session is updated", async () => {
		const { db } = testDb;

		// Create a test user with old lastActiveAt
		const userId = crypto.randomUUID();
		const testEmail = `test-update-${userId}@example.com`;
		const oldDate = new Date("2020-01-01");

		await db.insert(table.user).values({
			id: userId,
			email: testEmail,
			isAdmin: false,
			lastActiveAt: oldDate,
		});

		// Create a session (this will update lastActiveAt)
		const sessionToken = generateSessionToken();
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)));
		const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

		await db.insert(table.session).values({
			id: sessionId,
			userId: userId,
			expiresAt,
		});

		// Reset lastActiveAt to old date to test the update trigger
		await db.update(table.user).set({ lastActiveAt: oldDate }).where(eq(table.user.id, userId));

		// Verify it's set to old date
		const [userBefore] = await db
			.select({ lastActiveAt: table.user.lastActiveAt })
			.from(table.user)
			.where(eq(table.user.id, userId));
		expect(userBefore).toBeDefined();
		expect(userBefore?.lastActiveAt?.getTime()).toBe(oldDate.getTime());

		// Update the session (simulating session renewal)
		const newExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60);
		await db.update(table.session).set({ expiresAt: newExpiresAt }).where(eq(table.session.id, sessionId));

		// Verify lastActiveAt was updated by the trigger
		const [userAfter] = await db
			.select({ lastActiveAt: table.user.lastActiveAt })
			.from(table.user)
			.where(eq(table.user.id, userId));

		expect(userAfter).toBeDefined();
		expect(userAfter?.lastActiveAt).not.toBeNull();
		expect(userAfter?.lastActiveAt?.getTime()).toBeGreaterThan(oldDate.getTime());
		// Should be within the last 5 seconds
		expect(userAfter?.lastActiveAt?.getTime()).toBeGreaterThan(Date.now() - 5000);
	});
});
