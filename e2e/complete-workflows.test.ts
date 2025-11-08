import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "../src/lib/server/payment";
import { env } from "../src/lib/server/env";

/**
 * Complete End-to-End Workflow Tests
 *
 * Tests complete user journeys that span multiple components and systems.
 */

test.describe("Complete Workflows", () => {
	test("complete membership lifecycle: purchase → payment → approval → active", async ({ adminPage, testData }) => {
		const user = await testData.createUser({
			firstNames: "Lifecycle",
			lastName: "Test",
			isAdmin: false,
		});

		const member = await testData.createMember({
			userId: user.id,
			status: "awaiting_payment",
		});

		let updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("awaiting_payment");

		const webhookPayload = JSON.stringify({
			id: `evt_lifecycle_${Date.now()}`,
			type: "checkout.session.completed",
			data: {
				object: {
					id: member.stripeSessionId,
					payment_status: "paid",
				},
			},
		});

		const webhookSignature = stripe.webhooks.generateTestHeaderString({
			payload: webhookPayload,
			secret: env.STRIPE_WEBHOOK_SECRET,
		});

		const webhookRequest = new Request(`${env.PUBLIC_URL}/api/webhook/stripe`, {
			method: "POST",
			body: webhookPayload,
			headers: {
				"content-type": "application/json",
				"stripe-signature": webhookSignature,
			},
		});

		const { POST } = await import("../src/routes/api/webhook/stripe/+server.js");
		const webhookResponse = await POST({
			request: webhookRequest,
			url: new URL(webhookRequest.url),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		expect(webhookResponse.status).toBe(200);

		updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("awaiting_approval");

		await adminPage.goto("/admin/members", { waitUntil: "networkidle" });

		const memberRow = adminPage.getByTestId(`member-row-${user.id}`);
		await expect(memberRow).toBeVisible();

		const expandButton = adminPage.getByTestId(`expand-member-${user.id}`);
		await expandButton.click();

		const approveButton = adminPage.getByTestId(`approve-member-${member.id}`);
		await expect(approveButton).toBeVisible({ timeout: 3000 });
		await approveButton.click();

		await expect(memberRow).toBeVisible();
		await adminPage.waitForLoadState("networkidle");

		updatedMember = await db.query.member.findFirst({
			where: eq(table.member.id, member.id),
		});
		expect(updatedMember?.status).toBe("active");
	});

	test("admin workflow: create membership → verify in purchase page", async ({ adminPage, authenticatedPage }) => {
		const timestamp = Date.now();
		const uniqueType = `E2E Workflow ${timestamp}`;
		const uniquePriceId = `price_workflow_${timestamp}`;

		await adminPage.goto("/admin/memberships", { waitUntil: "networkidle" });

		await adminPage.locator('input[name="type"]').fill(uniqueType);
		await adminPage.locator('input[name="stripePriceId"]').fill(uniquePriceId);
		await adminPage.locator('input[name="startTime"]').fill("2026-06-01");
		await adminPage.locator('input[name="endTime"]').fill("2026-12-31");
		await adminPage.locator('input[name="priceCents"]').fill("12345");

		const submitButton = adminPage.locator('form[action*="createMembership"] button[type="submit"]');
		await submitButton.click();

		await expect(adminPage.getByText(uniqueType)).toBeVisible({ timeout: 5000 });

		const createdMembership = await db.query.membership.findFirst({
			where: eq(table.membership.type, uniqueType),
		});
		expect(createdMembership).toBeDefined();
		if (!createdMembership) throw new Error("Membership not created");

		const cleanupMembershipId = createdMembership.id;

		try {
			await authenticatedPage.goto("/new", { waitUntil: "networkidle" });
			await expect(authenticatedPage.getByText(uniqueType)).toBeVisible();

			const membershipLabel = authenticatedPage.getByTestId(`membership-option-${createdMembership.id}`);
			await expect(membershipLabel).toBeVisible();
			await expect(membershipLabel).toContainText("123");
		} finally {
			// Manual cleanup - UI-created resource, not from testData
			await db
				.delete(table.membership)
				.where(eq(table.membership.id, cleanupMembershipId))
				.catch(() => {});
		}
	});
});
