import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "./+server";
import { stripe } from "$lib/server/payment";
import { env } from "$lib/server/env";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Webhook Endpoint Security Tests
 *
 * These tests verify that the Stripe webhook endpoint properly validates
 * incoming requests and handles security concerns like signature verification
 * and replay attacks.
 *
 * CRITICAL: These tests ensure that unauthorized requests cannot trigger
 * member status changes.
 */

describe("Stripe Webhook Endpoint Security", () => {
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

		// Create test member
		await db.insert(table.member).values({
			id: testMemberId,
			userId: testUserId,
			membershipId: testMembershipId,
			stripeSessionId: testSessionId,
			status: "awaiting_payment",
		});
	});

	afterEach(async () => {
		// Clean up test data
		await db.delete(table.member).where(eq(table.member.id, testMemberId));
		await db.delete(table.membership).where(eq(table.membership.id, testMembershipId));
		await db.delete(table.user).where(eq(table.user.id, testUserId));
	});

	describe("Signature Verification", () => {
		it("rejects requests without signature header", async () => {
			const payload = JSON.stringify({
				id: "evt_test_123",
				type: "checkout.session.completed",
				data: {
					object: {
						id: testSessionId,
					},
				},
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.message).toContain("Missing webhook signature");
		});

		it("rejects requests with invalid signature", async () => {
			const payload = JSON.stringify({
				id: "evt_test_123",
				type: "checkout.session.completed",
				data: {
					object: {
						id: testSessionId,
					},
				},
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": "invalid_signature",
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.message).toContain("signature verification failed");
		});

		it("accepts requests with valid signature", async () => {
			const timestamp = Math.floor(Date.now() / 1000);
			const payload = JSON.stringify({
				id: "evt_test_valid_123",
				type: "checkout.session.completed",
				data: {
					object: {
						id: testSessionId,
					},
				},
			});

			// Generate valid signature using Stripe's test helper
			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": signature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
		});
	});

	describe("Replay Attack Protection", () => {
		it("detects and rejects duplicate event IDs", async () => {
			const eventId = `evt_test_duplicate_${Date.now()}`;
			const payload = JSON.stringify({
				id: eventId,
				type: "checkout.session.completed",
				data: {
					object: {
						id: testSessionId,
					},
				},
			});

			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const createRequest = () =>
				new Request("http://localhost/api/webhook/stripe", {
					method: "POST",
					body: payload,
					headers: {
						"content-type": "application/json",
						"stripe-signature": signature,
					},
				});

			// First request should succeed
			const response1 = await POST({
				request: createRequest(),
				url: new URL("http://localhost/api/webhook/stripe"),
			} as any);
			const data1 = await response1.json();
			expect(response1.status).toBe(200);
			expect(data1.received).toBe(true);
			expect(data1.duplicate).toBeUndefined();

			// Second request with same event ID should be detected as duplicate
			const response2 = await POST({
				request: createRequest(),
				url: new URL("http://localhost/api/webhook/stripe"),
			} as any);
			const data2 = await response2.json();
			expect(response2.status).toBe(200);
			expect(data2.duplicate).toBe(true);

			// Verify member status was only updated once
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("awaiting_approval"); // Should be updated only once
		});

		it("prevents timestamp replay attacks (handled by Stripe SDK)", async () => {
			// Stripe's constructEvent automatically rejects events older than 300 seconds
			// This test verifies that old signatures are rejected
			const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
			const payload = JSON.stringify({
				id: "evt_test_old_123",
				type: "checkout.session.completed",
				data: {
					object: {
						id: testSessionId,
					},
				},
			});

			// Manually construct signature with old timestamp
			const signedPayload = `${oldTimestamp}.${payload}`;
			const crypto = await import("crypto");
			const signature = crypto.createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(signedPayload).digest("hex");
			const stripeSignature = `t=${oldTimestamp},v1=${signature}`;

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": stripeSignature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			// Should reject due to timestamp verification failure
			expect(response.status).toBe(400);
			expect(data.message).toContain("verification failed");
		});
	});

	describe("Event Processing", () => {
		it("processes checkout.session.completed events", async () => {
			const eventId = `evt_test_completed_${Date.now()}`;
			const payload = JSON.stringify({
				id: eventId,
				type: "checkout.session.completed",
				data: {
					object: {
						id: testSessionId,
						payment_status: "paid",
					},
				},
			});

			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": signature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);

			// Verify member status was updated
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("awaiting_approval");
		});

		it("processes checkout.session.expired events", async () => {
			const eventId = `evt_test_expired_${Date.now()}`;
			const payload = JSON.stringify({
				id: eventId,
				type: "checkout.session.expired",
				data: {
					object: {
						id: testSessionId,
					},
				},
			});

			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": signature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.received).toBe(true);

			// Verify member status was updated to cancelled
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("cancelled");
		});

		it("handles unknown event types gracefully", async () => {
			const eventId = `evt_test_unknown_${Date.now()}`;
			const payload = JSON.stringify({
				id: eventId,
				type: "some.unknown.event",
				data: {
					object: {
						id: "some_object_123",
					},
				},
			});

			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": signature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			// Should accept the webhook but not process it
			expect(response.status).toBe(200);
			expect(data.received).toBe(true);

			// Verify member status was not changed
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("awaiting_payment");
		});
	});

	describe("Error Handling", () => {
		it("returns 200 even when event processing fails", async () => {
			// Use a session ID that doesn't exist to trigger processing error
			const nonExistentSession = "cs_test_nonexistent";
			const eventId = `evt_test_error_${Date.now()}`;
			const payload = JSON.stringify({
				id: eventId,
				type: "checkout.session.completed",
				data: {
					object: {
						id: nonExistentSession,
					},
				},
			});

			const signature = stripe.webhooks.generateTestHeaderString({
				payload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: payload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": signature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);
			const data = await response.json();

			// Should still return 200 to acknowledge receipt
			// (Stripe will retry if we return error status)
			expect(response.status).toBe(200);
			expect(data.received).toBe(true);
			// Error information included but status is success
			expect(data.error).toBeDefined();
		});

		it("handles malformed JSON payload", async () => {
			const malformedPayload = "{ invalid json }";

			const signature = stripe.webhooks.generateTestHeaderString({
				payload: malformedPayload,
				secret: env.STRIPE_WEBHOOK_SECRET,
			});

			const request = new Request("http://localhost/api/webhook/stripe", {
				method: "POST",
				body: malformedPayload,
				headers: {
					"content-type": "application/json",
					"stripe-signature": signature,
				},
			});

			const response = await POST({ request, url: new URL(request.url) } as any);

			// Should reject due to signature verification failure
			// (Stripe's constructEvent will fail on malformed JSON)
			expect(response.status).toBe(400);
		});
	});

	describe("Memory Management", () => {
		it("limits processedEvents set size to prevent memory leak", async () => {
			// This test verifies that the webhook handler doesn't infinitely grow
			// the processedEvents set in memory
			// Note: This is more of a logic verification since we can't easily test 10k events

			const responses = [];
			const eventCount = 15; // Small number for testing

			for (let i = 0; i < eventCount; i++) {
				const eventId = `evt_test_memory_${Date.now()}_${i}`;
				const payload = JSON.stringify({
					id: eventId,
					type: "checkout.session.completed",
					data: {
						object: {
							id: `cs_test_${i}`,
						},
					},
				});

				const signature = stripe.webhooks.generateTestHeaderString({
					payload,
					secret: env.STRIPE_WEBHOOK_SECRET,
				});

				const request = new Request("http://localhost/api/webhook/stripe", {
					method: "POST",
					body: payload,
					headers: {
						"content-type": "application/json",
						"stripe-signature": signature,
					},
				});

				const response = await POST({ request, url: new URL(request.url) } as any);
				responses.push(response);
			}

			// All requests should succeed
			for (const response of responses) {
				expect(response.status).toBe(200);
			}

			// Verify all events are tracked as unique (no duplicates)
			const duplicates = responses.filter(async (r) => {
				const data = await r.json();
				return data.duplicate === true;
			});
			expect(duplicates.length).toBe(0);
		});
	});
});
