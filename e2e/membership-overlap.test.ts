import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq, like } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Membership Overlap Blocking", () => {
	// Run tests serially since they depend on the admin user's membership state
	test.describe.configure({ mode: "serial" });

	// Use existing membership type from seed data
	const membershipTypeId = "ulkojasen"; // External member - no student verification required

	// Pattern to identify test memberships for cleanup
	const testPricePattern = "price_test_overlap_%";

	test.beforeEach(async ({ db }) => {
		// Clean up any existing test memberships for the admin user from previous runs
		// First delete member records (due to foreign key constraints)
		const testMemberships = await db
			.select({ id: table.membership.id })
			.from(table.membership)
			.where(like(table.membership.stripePriceId, testPricePattern));

		const testMembershipIds = testMemberships.map((m) => m.id);

		if (testMembershipIds.length > 0) {
			for (const membershipId of testMembershipIds) {
				await db.delete(table.member).where(eq(table.member.membershipId, membershipId));
			}
			// Then delete the memberships themselves
			for (const membershipId of testMembershipIds) {
				await db.delete(table.membership).where(eq(table.membership.id, membershipId));
			}
		}
	});

	test("shows membership when user has no blocking memberships for that period", async ({ adminPage, db }) => {
		// Create a test membership for a far future period
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_visible_1",
			startTime: new Date(2050, 7, 1),
			endTime: new Date(2051, 6, 31),
			requiresStudentVerification: false,
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// Verify the membership is shown (date format: d.M.yyyy in Finnish)
		await expect(adminPage.getByText(/1\.8\.2050/)).toBeVisible();
	});

	test("hides membership when user has active membership for same period", async ({ adminPage, adminUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_active_1",
			startTime: new Date(2051, 7, 1),
			endTime: new Date(2052, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an active member record for the admin user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "active",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// Verify the membership is NOT shown (blocked by active membership)
		await expect(adminPage.getByText(/1\.8\.2051/)).not.toBeVisible();
	});

	test("shows membership when user has cancelled membership for same period", async ({ adminPage, adminUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_cancelled_1",
			startTime: new Date(2052, 7, 1),
			endTime: new Date(2053, 6, 31),
			requiresStudentVerification: false,
		});

		// Create a cancelled member record for the admin user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "cancelled",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// Verify the membership IS shown (cancelled memberships don't block)
		await expect(adminPage.getByText(/1\.8\.2052/)).toBeVisible();
	});

	test("shows membership when user has expired membership for same period", async ({ adminPage, adminUser, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_expired_1",
			startTime: new Date(2053, 7, 1),
			endTime: new Date(2054, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an expired member record for the admin user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "expired",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// Verify the membership IS shown (expired memberships don't block)
		await expect(adminPage.getByText(/1\.8\.2053/)).toBeVisible();
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
			stripePriceId: "price_test_overlap_awaiting_payment_1",
			startTime: new Date(2054, 7, 1),
			endTime: new Date(2055, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an awaiting_payment member record for the admin user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "awaiting_payment",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// Verify the membership is NOT shown (awaiting_payment blocks)
		await expect(adminPage.getByText(/1\.8\.2054/)).not.toBeVisible();
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
			stripePriceId: "price_test_overlap_awaiting_approval_1",
			startTime: new Date(2055, 7, 1),
			endTime: new Date(2056, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an awaiting_approval member record for the admin user
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: testMembershipId,
			status: "awaiting_approval",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// Verify the membership is NOT shown (awaiting_approval blocks)
		await expect(adminPage.getByText(/1\.8\.2055/)).not.toBeVisible();
	});

	test("blocks future memberships when user has active membership ending later", async ({
		adminPage,
		adminUser,
		db,
	}) => {
		// Create current membership (2070-2072) - user has this active
		const currentMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: currentMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_current_blocking",
			startTime: new Date(2070, 7, 1),
			endTime: new Date(2072, 6, 31), // Ends in July 2072
			requiresStudentVerification: false,
		});

		// Future membership (2071-2072) - starts before current ends
		const futureMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: futureMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_future_blocked",
			startTime: new Date(2071, 7, 1), // Starts August 2071, before July 2072 end
			endTime: new Date(2072, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an active member record for the current membership
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: currentMembershipId,
			status: "active",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// The future membership (2071-2072) should be blocked because its start time
		// is before the active membership's end time (July 2072)
		await expect(adminPage.getByText(/1\.8\.2071/)).not.toBeVisible();
	});

	test("allows future memberships when they start after active membership ends", async ({
		adminPage,
		adminUser,
		db,
	}) => {
		// Current membership (2080-2081)
		const currentMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: currentMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_current_nonblocking",
			startTime: new Date(2080, 7, 1),
			endTime: new Date(2081, 6, 31), // Ends July 2081
			requiresStudentVerification: false,
		});

		// Future membership (2081-2082) - starts exactly when current ends
		const futureMembershipId = crypto.randomUUID();
		await db.insert(table.membership).values({
			id: futureMembershipId,
			membershipTypeId,
			stripePriceId: "price_test_overlap_future_allowed",
			startTime: new Date(2081, 7, 1), // Starts August 2081, after July 2081 end
			endTime: new Date(2082, 6, 31),
			requiresStudentVerification: false,
		});

		// Create an active member record for the current membership
		await db.insert(table.member).values({
			id: crypto.randomUUID(),
			userId: adminUser.id,
			membershipId: currentMembershipId,
			status: "active",
		});

		await adminPage.goto(route("/[locale=locale]/new", { locale: "fi" }));
		await adminPage.waitForLoadState("networkidle");

		// The future membership (2081-2082) should be available because it starts
		// on or after the active membership ends
		await expect(adminPage.getByText(/1\.8\.2081/)).toBeVisible();
	});
});
