import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Membership Overlap Blocking", () => {
	// Track test data for cleanup
	let testMembershipIds: string[] = [];
	let testMemberIds: string[] = [];

	// Use existing membership type from seed data
	const membershipTypeId = "ulkojasen"; // External member - no student verification required

	test.afterEach(async ({ db }) => {
		// Clean up test members first (due to foreign key constraints)
		for (const id of testMemberIds) {
			await db.delete(table.member).where(eq(table.member.id, id));
		}
		testMemberIds = [];

		// Clean up test memberships
		for (const id of testMembershipIds) {
			await db.delete(table.membership).where(eq(table.membership.id, id));
		}
		testMembershipIds = [];
	});

	test("shows all available memberships when user has no memberships", async ({ adminPage, db }) => {
		// Create a test membership for a future period
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_1",
			startTime: new Date(2050, 7, 1), // Far future to avoid conflicts
			endTime: new Date(2051, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Ensure test user has no existing memberships for this period
		// (adminUser from seed data may have memberships, but not for 2050-2051)

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the membership is shown
		await expect(adminPage.getByText(/2050.*2051/)).toBeVisible();
	});

	test("hides membership when user has active membership for same period", async ({ adminPage, adminUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_2",
			startTime: new Date(2051, 7, 1),
			endTime: new Date(2052, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Create an active member record for the admin user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "active",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the membership is NOT shown (blocked by active membership)
		await expect(adminPage.getByText(/2051.*2052/)).not.toBeVisible();
	});

	test("shows membership when user has cancelled membership for same period", async ({ adminPage, adminUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_3",
			startTime: new Date(2052, 7, 1),
			endTime: new Date(2053, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Create a cancelled member record for the admin user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "cancelled",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the membership IS shown (cancelled memberships don't block)
		await expect(adminPage.getByText(/2052.*2053/)).toBeVisible();
	});

	test("shows membership when user has expired membership for same period", async ({ adminPage, adminUser, db }) => {
		// Create a test membership for a past period (already expired)
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_4",
			startTime: new Date(2053, 7, 1),
			endTime: new Date(2054, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Create an expired member record for the admin user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "expired",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the membership IS shown (expired memberships don't block)
		await expect(adminPage.getByText(/2053.*2054/)).toBeVisible();
	});

	test("hides membership when user has awaiting_payment membership for same period", async ({
		adminPage,
		adminUser,
		db,
	}) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_5",
			startTime: new Date(2054, 7, 1),
			endTime: new Date(2055, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Create an awaiting_payment member record for the admin user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "awaiting_payment",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the membership is NOT shown (awaiting_payment blocks)
		await expect(adminPage.getByText(/2054.*2055/)).not.toBeVisible();
	});

	test("hides membership when user has awaiting_approval membership for same period", async ({
		adminPage,
		adminUser,
		db,
	}) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_6",
			startTime: new Date(2055, 7, 1),
			endTime: new Date(2056, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Create an awaiting_approval member record for the admin user
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "awaiting_approval",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the membership is NOT shown (awaiting_approval blocks)
		await expect(adminPage.getByText(/2055.*2056/)).not.toBeVisible();
	});

	test("shows no memberships message when all are blocked", async ({ adminPage, adminUser, db }) => {
		// Create a test membership that will be the only available one
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_all_blocked",
			startTime: new Date(2060, 7, 1),
			endTime: new Date(2061, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		// Create an active member record that blocks this membership
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "active",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify the blocked membership doesn't appear
		await expect(adminPage.getByText(/2060.*2061/)).not.toBeVisible();
	});

	test("blocks future memberships when user has active membership ending later", async ({
		adminPage,
		adminUser,
		db,
	}) => {
		// Create two test memberships: one current (active) and one future
		const currentMembershipId = crypto.randomUUID();
		const futureMembershipId = crypto.randomUUID();

		// Current membership (2070-2072) - user has this active
		await db.insert(table.membership).values({
			id: currentMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_current",
			startTime: new Date(2070, 7, 1),
			endTime: new Date(2072, 6, 31), // Ends in 2072
			requiresStudentVerification: false,
		});
		testMembershipIds.push(currentMembershipId);

		// Future membership (2071-2072) - starts before current ends
		await db.insert(table.membership).values({
			id: futureMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_future",
			startTime: new Date(2071, 7, 1), // Starts in 2071, before 2072
			endTime: new Date(2072, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(futureMembershipId);

		// Create an active member record for the current membership
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: currentMembershipId,
			status: "active",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// The future membership (2071-2072) should be blocked because its start time
		// is before the active membership's end time (2072)
		await expect(adminPage.getByText(/2071.*2072/)).not.toBeVisible();
	});

	test("allows future memberships when they start after active membership ends", async ({
		adminPage,
		adminUser,
		db,
	}) => {
		// Create two test memberships: one current (active) and one future that doesn't overlap
		const currentMembershipId = crypto.randomUUID();
		const futureMembershipId = crypto.randomUUID();

		// Current membership (2080-2081)
		await db.insert(table.membership).values({
			id: currentMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_no_overlap_current",
			startTime: new Date(2080, 7, 1),
			endTime: new Date(2081, 6, 31), // Ends July 2081
			requiresStudentVerification: false,
		});
		testMembershipIds.push(currentMembershipId);

		// Future membership (2081-2082) - starts exactly when current ends
		await db.insert(table.membership).values({
			id: futureMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_no_overlap_future",
			startTime: new Date(2081, 7, 1), // Starts August 2081, after July 2081 end
			endTime: new Date(2082, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(futureMembershipId);

		// Create an active member record for the current membership
		const testMemberId = crypto.randomUUID();
		await db.insert(table.member).values({
			id: testMemberId,
			userId: adminUser.id,
			membershipId: currentMembershipId,
			status: "active",
		});
		testMemberIds.push(testMemberId);

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// The future membership (2081-2082) should be available because it starts
		// on or after the active membership ends
		await expect(adminPage.getByText(/2081.*2082/)).toBeVisible();
	});
});
