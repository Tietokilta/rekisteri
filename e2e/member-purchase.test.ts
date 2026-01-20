import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq, isNotNull, and, gt } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Page } from "@playwright/test";

test.describe("Member Purchase Flow", () => {
	// Track test members for cleanup
	let testMemberIds: string[] = [];

	test.beforeEach(async ({ db, adminUser }) => {
		// Ensure admin user has a complete profile (required for /new page)
		// Use .returning() to verify the update actually worked
		const result = await db
			.update(table.user)
			.set({
				firstNames: "Test",
				lastName: "Admin",
				homeMunicipality: "Espoo",
			})
			.where(eq(table.user.id, adminUser.id))
			.returning({ id: table.user.id });

		if (result.length === 0) {
			throw new Error(
				`beforeEach: Failed to update user profile. User ${adminUser.id} not found in database. ` +
					`This usually means the global-setup did not seed the database correctly.`,
			);
		}
	});

	test.afterEach(async ({ db }) => {
		// Clean up test members
		for (const id of testMemberIds) {
			await db.delete(table.member).where(eq(table.member.id, id));
		}
		testMemberIds = [];
	});

	// Helper to get a membership with Stripe price ID
	async function getMembershipWithStripePrice(db: PostgresJsDatabase<typeof table>) {
		const [membership] = await db
			.select()
			.from(table.membership)
			.where(and(isNotNull(table.membership.stripePriceId), gt(table.membership.endTime, new Date())))
			.limit(1);
		if (!membership) throw new Error("No membership with Stripe price found");
		return membership;
	}

	// Helper to navigate to /new and verify the membership form is visible
	// Fails with a clear error if ProfileIncompleteCard is shown instead
	async function gotoNewMembershipPage(page: Page) {
		await page.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Check if ProfileIncompleteCard is visible (indicates profile is incomplete)
		const profileIncomplete = page.getByText("Täydennä profiilisi");
		const isProfileIncomplete = await profileIncomplete.isVisible().catch(() => false);

		if (isProfileIncomplete) {
			throw new Error(
				"ProfileIncompleteCard is visible - the user profile is incomplete. " +
					"The beforeEach hook should have set firstNames, lastName, and homeMunicipality. " +
					"This indicates a database sync issue between the test and the server.",
			);
		}

		// Wait for the membership purchase button to be visible (more reliable than form element)
		await expect(page.getByRole("button", { name: "Osta jäsenyys" })).toBeVisible();
	}

	test("shows 'Complete Payment' button for awaiting_payment status", async ({ adminPage, adminUser, db }) => {
		const membership = await getMembershipWithStripePrice(db);

		// Create an awaiting_payment member for the test user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: membership.id,
			status: "awaiting_payment",
			stripeSessionId: "test_session_" + testMemberId,
		});
		testMemberIds.push(testMemberId);

		// Navigate to home page
		await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the "Complete Payment" / "Jatka maksua" button is visible
		await expect(adminPage.getByRole("button", { name: "Jatka maksua" })).toBeVisible();

		// Verify the "New" button is NOT visible when awaiting_payment
		await expect(adminPage.getByRole("link", { name: /Osta uusi|Uusi jäsenyys|Hanki jäsenyys/i })).not.toBeVisible();
	});

	test("allows repurchasing cancelled membership", async ({ adminPage, adminUser, db }) => {
		const membership = await getMembershipWithStripePrice(db);

		// Create a cancelled member for the test user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: membership.id,
			status: "cancelled",
			stripeSessionId: null,
		});
		testMemberIds.push(testMemberId);

		// Navigate to new membership page and verify form is visible
		await gotoNewMembershipPage(adminPage);

		// The cancelled membership should be available to repurchase
		// Look for a radio button for that membership type
		const membershipRadio = adminPage.getByRole("radio");
		await expect(membershipRadio.first()).toBeVisible();
	});

	test("allows repurchasing expired membership", async ({ adminPage, adminUser, db }) => {
		const membership = await getMembershipWithStripePrice(db);

		// Create an expired member for the test user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: membership.id,
			status: "expired",
			stripeSessionId: null,
		});
		testMemberIds.push(testMemberId);

		// Navigate to new membership page and verify form is visible
		await gotoNewMembershipPage(adminPage);

		// The expired membership should be available to repurchase
		const membershipRadio = adminPage.getByRole("radio");
		await expect(membershipRadio.first()).toBeVisible();
	});

	test("blocks repurchasing active membership", async ({ adminPage, adminUser, db }) => {
		const membership = await getMembershipWithStripePrice(db);

		// First, clean up any existing members for this user to ensure test isolation
		await db.delete(table.member).where(eq(table.member.userId, adminUser.id));

		// Create an active member for the test user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: membership.id,
			status: "active",
			stripeSessionId: null,
		});
		testMemberIds.push(testMemberId);

		// Navigate to new membership page and verify form is visible
		await gotoNewMembershipPage(adminPage);

		// The active membership should be filtered out - verify no radio button exists for it
		// Radio buttons have the membership ID as their value
		const activeRadio = adminPage.locator(`input[type="radio"][value="${membership.id}"]`);
		await expect(activeRadio).not.toBeVisible();
	});

	test("shows status badge correctly on home page", async ({ adminPage, adminUser, db }) => {
		const membership = await getMembershipWithStripePrice(db);

		// Create an awaiting_approval member
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: membership.id,
			status: "awaiting_approval",
			stripeSessionId: "test_session_" + testMemberId,
		});
		testMemberIds.push(testMemberId);

		// Navigate to home page
		await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the awaiting approval badge/status is visible
		await expect(adminPage.getByText("Odottaa hyväksyntää")).toBeVisible();
	});

	test("home page shows 'Renew membership' for expired membership", async ({ adminPage, adminUser, db }) => {
		const membership = await getMembershipWithStripePrice(db);

		// Create an expired member for the test user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: membership.id,
			status: "expired",
			stripeSessionId: null,
		});
		testMemberIds.push(testMemberId);

		// Navigate to home page
		await adminPage.goto(route("/[locale=locale]", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the "Renew membership" / "Uusi jäsenyys" button is visible
		await expect(adminPage.getByRole("link", { name: "Uusi jäsenyys" })).toBeVisible();
	});
});
