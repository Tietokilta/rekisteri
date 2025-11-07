import { test as base } from "@playwright/test";
import { db } from "../../src/lib/server/db";
import * as table from "../../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Test Data Fixture
 *
 * Provides helpers for creating test data with automatic cleanup.
 * Solves the test data dependence problem - tests no longer rely on seeded data.
 *
 * Benefits:
 * - Tests are isolated and can run in parallel
 * - No test interdependence
 * - Automatic cleanup even if test fails
 * - Reproducible test failures
 */

type User = typeof table.user.$inferSelect;
type Member = typeof table.member.$inferSelect;
type Membership = typeof table.membership.$inferSelect;
type Session = typeof table.session.$inferSelect;

interface TestData {
	createUser(data?: Partial<Omit<User, "id" | "createdAt" | "updatedAt">>): Promise<User>;
	createMembership(data?: Partial<Omit<Membership, "id" | "createdAt" | "updatedAt">>): Promise<Membership>;
	createMember(data?: Partial<Omit<Member, "id" | "createdAt" | "updatedAt">>): Promise<Member>;
	createSession(userId: string, data?: Partial<Omit<Session, "id" | "userId">>): Promise<Session>;
	cleanup(): Promise<void>;
}

export const test = base.extend<{ testData: TestData }>({
	testData: async (_, use) => {
		const createdIds: { type: string; id: string }[] = [];

		const testData: TestData = {
			async createUser(data = {}) {
				const userId = crypto.randomUUID();
				const timestamp = Date.now();

				const [user] = await db
					.insert(table.user)
					.values({
						id: userId,
						email: data.email ?? `test-${timestamp}@example.com`,
						isAdmin: data.isAdmin ?? false,
						firstNames: data.firstNames ?? `TestFirst${timestamp}`,
						lastName: data.lastName ?? `TestLast${timestamp}`,
						homeMunicipality: data.homeMunicipality ?? null,
						isAllowedEmails: data.isAllowedEmails ?? false,
						stripeCustomerId: data.stripeCustomerId ?? null,
					})
					.returning();

				if (!user) throw new Error("Failed to create user");
				createdIds.push({ type: "user", id: user.id });
				return user;
			},

			async createMembership(data = {}) {
				const membershipId = crypto.randomUUID();
				const timestamp = Date.now();

				const [membership] = await db
					.insert(table.membership)
					.values({
						id: membershipId,
						type: data.type ?? `Test Membership ${timestamp}`,
						stripePriceId: data.stripePriceId ?? `price_test_${timestamp}`,
						startTime: data.startTime ?? new Date("2025-01-01"),
						endTime: data.endTime ?? new Date("2025-12-31"),
						priceCents: data.priceCents ?? 1000,
						requiresStudentVerification: data.requiresStudentVerification ?? false,
					})
					.returning();

				if (!membership) throw new Error("Failed to create membership");
				createdIds.push({ type: "membership", id: membership.id });
				return membership;
			},

			async createMember(data = {}) {
				const memberId = crypto.randomUUID();
				const timestamp = Date.now();

				// Create dependencies if not provided
				let userId = data.userId;
				if (!userId) {
					const user = await this.createUser();
					userId = user.id;
				}

				let membershipId = data.membershipId;
				if (!membershipId) {
					const membership = await this.createMembership();
					membershipId = membership.id;
				}

				const [member] = await db
					.insert(table.member)
					.values({
						id: memberId,
						userId,
						membershipId,
						stripeSessionId: data.stripeSessionId ?? `cs_test_${timestamp}`,
						status: data.status ?? "awaiting_approval",
					})
					.returning();

				if (!member) throw new Error("Failed to create member");
				createdIds.push({ type: "member", id: member.id });
				return member;
			},

			async createSession(userId: string, data = {}) {
				const sessionId = crypto.randomUUID();

				const [session] = await db
					.insert(table.session)
					.values({
						id: sessionId,
						userId,
						expiresAt: data.expiresAt ?? new Date(Date.now() + 86_400_000), // 24 hours
					})
					.returning();

				if (!session) throw new Error("Failed to create session");
				createdIds.push({ type: "session", id: session.id });
				return session;
			},

			async cleanup() {
				// Cleanup in reverse order to handle foreign key constraints
				// Members must be deleted before users and memberships
				for (const { type, id } of createdIds.toReversed()) {
					try {
						switch (type) {
							case "member": {
								await db.delete(table.member).where(eq(table.member.id, id));

								break;
							}
							case "session": {
								await db.delete(table.session).where(eq(table.session.id, id));

								break;
							}
							case "user": {
								await db.delete(table.user).where(eq(table.user.id, id));

								break;
							}
							case "membership": {
								await db.delete(table.membership).where(eq(table.membership.id, id));

								break;
							}
							// No default
						}
					} catch (error) {
						// Ignore cleanup errors (record might not exist)
						console.warn(`Failed to cleanup ${type}:${id}`, error);
					}
				}
			},
		};

		// Provide fixture to test
		await use(testData);

		// Automatic cleanup after test, even if test fails
		await testData.cleanup();
	},
});

export { expect } from "@playwright/test";
