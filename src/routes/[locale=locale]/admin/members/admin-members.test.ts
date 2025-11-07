import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { actions } from "./+page.server";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq } from "drizzle-orm";

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test mocks use 'as any' for RequestEvent types - this is acceptable in tests

/**
 * Admin Workflow Tests
 *
 * These tests verify that admin actions correctly manage the member status
 * state machine and enforce proper authorization.
 *
 * CRITICAL: These tests ensure that the member approval workflow functions
 * correctly and that only admins can perform sensitive actions.
 */

describe("Admin Member Actions", () => {
	// Test data
	let testUserId: string;
	let testAdminUserId: string;
	let testMembershipId: string;
	let testMemberId: string;
	let testSessionId: string;
	let testAdminSessionId: string;

	beforeEach(async () => {
		// Create test data
		testUserId = crypto.randomUUID();
		testAdminUserId = crypto.randomUUID();
		testMembershipId = crypto.randomUUID();
		testMemberId = crypto.randomUUID();
		testSessionId = crypto.randomUUID();
		testAdminSessionId = crypto.randomUUID();

		// Create regular test user
		await db.insert(table.user).values({
			id: testUserId,
			email: `test-${Date.now()}@example.com`,
			isAdmin: false,
		});

		// Create admin user
		await db.insert(table.user).values({
			id: testAdminUserId,
			email: `admin-${Date.now()}@example.com`,
			isAdmin: true,
		});

		// Create sessions
		await db.insert(table.session).values({
			id: testSessionId,
			userId: testUserId,
			expiresAt: new Date(Date.now() + 86_400_000), // 24 hours
		});

		await db.insert(table.session).values({
			id: testAdminSessionId,
			userId: testAdminUserId,
			expiresAt: new Date(Date.now() + 86_400_000),
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
			stripeSessionId: `cs_test_${Date.now()}`,
			status: "awaiting_approval",
		});
	});

	afterEach(async () => {
		// Clean up test data
		await db.delete(table.member).where(eq(table.member.id, testMemberId));
		await db.delete(table.membership).where(eq(table.membership.id, testMembershipId));
		await db.delete(table.session).where(eq(table.session.id, testSessionId));
		await db.delete(table.session).where(eq(table.session.id, testAdminSessionId));
		await db.delete(table.user).where(eq(table.user.id, testUserId));
		await db.delete(table.user).where(eq(table.user.id, testAdminUserId));
	});

	describe("Authorization", () => {
		it("rejects approve action from non-admin user", async () => {
			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			// Non-admin user context
			const event = {
				request,
				locals: {
					session: { id: testSessionId },
					user: { id: testUserId, isAdmin: false },
				},
			} as any;

			// Should throw error (404 for security)
			await expect(actions.approve!(event)).rejects.toThrow();
		});

		it("rejects approve action from unauthenticated user", async () => {
			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: null,
					user: null,
				},
			} as any;

			await expect(actions.approve!(event)).rejects.toThrow();
		});

		it("allows approve action from admin user", async () => {
			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.approve!(event);
			expect(result).toHaveProperty("success", true);
		});
	});

	describe("Approve Action", () => {
		it("changes member status from awaiting_approval to active", async () => {
			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.approve!(event);

			expect(result).toHaveProperty("success", true);
			expect(result).toHaveProperty("message", "Member approved successfully");

			// Verify database was updated
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("active");
		});

		it("rejects approve action if member is not awaiting_approval", async () => {
			// Update member to active first
			await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.approve!(event);

			expect(result).toHaveProperty("success", false);
			expect(result?.message).toContain("not awaiting approval");
		});

		it("returns 404 for non-existent member", async () => {
			const formData = new FormData();
			formData.set("memberId", "non-existent-id");

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.approve!(event);

			expect(result).toHaveProperty("success", false);
			expect(result?.message).toContain("not found");
		});

		it("validates memberId parameter", async () => {
			const formData = new FormData();
			// No memberId provided

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.approve!(event);

			expect(result).toHaveProperty("success", false);
			expect(result?.message).toContain("required");
		});
	});

	describe("Reject Action", () => {
		it("changes member status to cancelled", async () => {
			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.reject!(event);

			expect(result).toHaveProperty("success", true);
			expect(result).toHaveProperty("message", "Member rejected successfully");

			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("cancelled");
		});

		it("can reject member from any status", async () => {
			// Test rejecting from active status
			await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.reject!(event);

			expect(result).toHaveProperty("success", true);

			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("cancelled");
		});
	});

	describe("Mark Expired Action", () => {
		it("changes member status to expired", async () => {
			// Set member to active first
			await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.markExpired!(event);

			expect(result).toHaveProperty("success", true);
			expect(result).toHaveProperty("message", "Member marked as expired");

			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("expired");
		});
	});

	describe("Cancel Action", () => {
		it("changes member status to cancelled", async () => {
			// Set member to active first
			await db.update(table.member).set({ status: "active" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.cancel!(event);

			expect(result).toHaveProperty("success", true);
			expect(result).toHaveProperty("message", "Membership cancelled successfully");

			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("cancelled");
		});
	});

	describe("Reactivate Action", () => {
		it("changes expired member to active", async () => {
			// Set member to expired first
			await db.update(table.member).set({ status: "expired" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.reactivate!(event);

			expect(result).toHaveProperty("success", true);
			expect(result).toHaveProperty("message", "Membership reactivated successfully");

			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("active");
		});

		it("changes cancelled member to active", async () => {
			// Set member to cancelled first
			await db.update(table.member).set({ status: "cancelled" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.reactivate!(event);

			expect(result).toHaveProperty("success", true);

			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("active");
		});

		it("rejects reactivating member that is not expired or cancelled", async () => {
			// Keep member in awaiting_approval status
			await db.update(table.member).set({ status: "awaiting_approval" }).where(eq(table.member.id, testMemberId));

			const formData = new FormData();
			formData.set("memberId", testMemberId);

			const request = new Request("http://localhost/admin/members", {
				method: "POST",
				body: formData,
			});

			const event = {
				request,
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			const result = await actions.reactivate!(event);

			expect(result).toHaveProperty("success", false);
			expect(result?.message).toContain("expired or cancelled");

			// Status should remain unchanged
			const member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});

			expect(member?.status).toBe("awaiting_approval");
		});
	});

	describe("State Machine Coverage", () => {
		it("supports complete state transition workflow", async () => {
			// Start: awaiting_payment
			await db.update(table.member).set({ status: "awaiting_payment" }).where(eq(table.member.id, testMemberId));

			let member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("awaiting_payment");

			// Transition 1: awaiting_payment → awaiting_approval (via webhook, tested separately)
			await db.update(table.member).set({ status: "awaiting_approval" }).where(eq(table.member.id, testMemberId));

			// Transition 2: awaiting_approval → active (via admin approve)
			const approveFormData = new FormData();
			approveFormData.set("memberId", testMemberId);

			const approveEvent = {
				request: new Request("http://localhost/admin/members", {
					method: "POST",
					body: approveFormData,
				}),
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			await actions.approve!(approveEvent);

			member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("active");

			// Transition 3: active → expired (via admin mark expired)
			const expireFormData = new FormData();
			expireFormData.set("memberId", testMemberId);

			const expireEvent = {
				request: new Request("http://localhost/admin/members", {
					method: "POST",
					body: expireFormData,
				}),
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			await actions.markExpired!(expireEvent);

			member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("expired");

			// Transition 4: expired → active (via admin reactivate)
			const reactivateFormData = new FormData();
			reactivateFormData.set("memberId", testMemberId);

			const reactivateEvent = {
				request: new Request("http://localhost/admin/members", {
					method: "POST",
					body: reactivateFormData,
				}),
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			await actions.reactivate!(reactivateEvent);

			member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("active");

			// Transition 5: active → cancelled (via admin cancel)
			const cancelFormData = new FormData();
			cancelFormData.set("memberId", testMemberId);

			const cancelEvent = {
				request: new Request("http://localhost/admin/members", {
					method: "POST",
					body: cancelFormData,
				}),
				locals: {
					session: { id: testAdminSessionId },
					user: { id: testAdminUserId, isAdmin: true },
				},
			} as any;

			await actions.cancel!(cancelEvent);

			member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("cancelled");

			// Transition 6: cancelled → active (via admin reactivate)
			await actions.reactivate!(reactivateEvent);

			member = await db.query.member.findFirst({
				where: eq(table.member.id, testMemberId),
			});
			expect(member?.status).toBe("active");
		});
	});
});
