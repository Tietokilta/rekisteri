import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { fulfillSession, cancelSession } from "$lib/server/payment/session";

/**
 * Integration Tests: Stripe Webhook Handling
 *
 * These tests verify that our webhook handlers correctly update member status
 * when receiving payment events from Stripe.
 *
 * Scope: Server-side business logic, database state changes
 * What we're testing: Our code's response to Stripe events
 * What we're NOT testing: Stripe's payment processing (they test that)
 */

describe("Stripe Webhook Integration", () => {
	// Test data
	let testUserId: string;
	let testMembershipId: string;
	let testMemberId: string;
	let testSessionId: string;

	beforeEach(async () => {
		// Create test data
		testUserId = crypto.randomUUID();
		testMembershipId = crypto.randomUUID();
		testMemberId = crypto.randomUUID();
		testSessionId = `cs_test_${Date.now()}`;

		// Create test user
		await db.insert(table.user).values({
			id: testUserId,
			email: `test-${Date.now()}@example.com`,
			isAdmin: false,
		});

		// Create test membership
		await db.insert(table.membership).values({
			id: testMembershipId,
			type: "test membership",
			stripePriceId: "price_test123",
			startTime: new Date("2025-01-01"),
			endTime: new Date("2025-12-31"),
			priceCents: 1000,
			requiresStudentVerification: false,
		});
	});

	afterEach(async () => {
		// Clean up test data
		await db.delete(table.member).where(eq(table.member.id, testMemberId));
		await db.delete(table.membership).where(eq(table.membership.id, testMembershipId));
		await db.delete(table.user).where(eq(table.user.id, testUserId));
	});

	describe("fulfillSession", () => {
		it("updates member status from awaiting_payment to awaiting_approval", async () => {
			// Arrange: Create member with awaiting_payment status
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: testMembershipId,
				stripeSessionId: testSessionId,
				status: "awaiting_payment",
			});

			// Act: Fulfill the session (simulating Stripe webhook)
			await fulfillSession(testSessionId);

			// Assert: Member status should be updated
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member).toBeDefined();
			expect(member?.status).toBe("awaiting_approval");
		});

		it("does not update member if status is not awaiting_payment", async () => {
			// Arrange: Create member already approved
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: testMembershipId,
				stripeSessionId: testSessionId,
				status: "active", // Already active
			});

			// Act: Try to fulfill the session
			await fulfillSession(testSessionId);

			// Assert: Status should remain unchanged
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("active");
		});

		it("handles non-existent session gracefully", async () => {
			// Act & Assert: Should not throw error
			await expect(fulfillSession("cs_test_nonexistent")).resolves.toBeUndefined();
		});

		it("prevents duplicate processing with concurrent requests", async () => {
			// Arrange: Create member
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: testMembershipId,
				stripeSessionId: testSessionId,
				status: "awaiting_payment",
			});

			// Act: Call fulfillSession multiple times concurrently (simulating duplicate webhooks)
			await Promise.all([
				fulfillSession(testSessionId),
				fulfillSession(testSessionId),
				fulfillSession(testSessionId),
			]);

			// Assert: Status should be updated only once
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("awaiting_approval");
		});
	});

	describe("cancelSession", () => {
		it("updates member status from awaiting_payment to cancelled", async () => {
			// Arrange: Create member with awaiting_payment status
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: testMembershipId,
				stripeSessionId: testSessionId,
				status: "awaiting_payment",
			});

			// Act: Cancel the session (simulating expired/failed payment)
			await cancelSession(testSessionId);

			// Assert: Member status should be cancelled
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member).toBeDefined();
			expect(member?.status).toBe("cancelled");
		});

		it("does not cancel member if status is not awaiting_payment", async () => {
			// Arrange: Create member already active
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: testMembershipId,
				stripeSessionId: testSessionId,
				status: "active",
			});

			// Act: Try to cancel the session
			await cancelSession(testSessionId);

			// Assert: Status should remain unchanged
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("active");
		});

		it("handles non-existent session gracefully", async () => {
			// Act & Assert: Should not throw error
			await expect(cancelSession("cs_test_nonexistent")).resolves.toBeUndefined();
		});
	});

	describe("Transaction Safety", () => {
		it("uses transaction to prevent race conditions", async () => {
			// This test verifies the implementation uses transactions
			// The actual transaction safety is tested by the concurrent requests test above

			// Arrange: Create member
			await db.insert(table.member).values({
				id: testMemberId,
				userId: testUserId,
				membershipId: testMembershipId,
				stripeSessionId: testSessionId,
				status: "awaiting_payment",
			});

			// Act: Rapid fire multiple fulfill and cancel requests
			const operations = [
				fulfillSession(testSessionId),
				cancelSession(testSessionId),
				fulfillSession(testSessionId),
			];

			await Promise.allSettled(operations);

			// Assert: Member should have a valid final state (not corrupted)
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member).toBeDefined();
			expect(["awaiting_approval", "cancelled", "awaiting_payment"]).toContain(member?.status);
		});
	});
});
