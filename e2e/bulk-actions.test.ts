import { test, expect } from "./fixtures/auth";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { generateUserId } from "../src/lib/server/auth/utils";

test.describe("Admin Bulk Actions", () => {
	let db: ReturnType<typeof drizzle>;
	let client: ReturnType<typeof postgres>;

	test.beforeAll(async () => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});

	test.describe("Selection and Toolbar", () => {
		test("checkbox column is visible and select all works", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/members");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Check that select all checkbox exists
			const selectAllCheckbox = adminPage.getByTestId("select-all-checkbox");
			await expect(selectAllCheckbox).toBeVisible();

			// Check that row checkboxes exist
			const rowCheckboxes = adminPage.getByTestId("row-select-checkbox");
			await expect(rowCheckboxes.first()).toBeVisible();

			// Initially no toolbar should be visible
			await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

			// Click select all
			await selectAllCheckbox.click();

			// Toolbar should now be visible
			await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();
		});

		test("selecting individual rows shows toolbar", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/members");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Initially no toolbar
			await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

			// Select first row
			const firstRowCheckbox = adminPage.getByTestId("row-select-checkbox").first();
			await firstRowCheckbox.click();

			// Toolbar should appear
			await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();

			// Should show "1 valittu" (1 selected)
			await expect(adminPage.getByTestId("bulk-action-toolbar")).toContainText("1 valittu");
		});

		test("clear selection button works", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/members");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Select first row
			const firstRowCheckbox = adminPage.getByTestId("row-select-checkbox").first();
			await firstRowCheckbox.click();

			// Toolbar should appear
			await expect(adminPage.getByTestId("bulk-action-toolbar")).toBeVisible();

			// Click clear selection
			await adminPage.getByRole("button", { name: "Tyhjennä valinta" }).click();

			// Toolbar should disappear
			await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();
		});
	});

	test.describe("Bulk Approve Members", () => {
		let testUsers: Array<{ id: string; email: string }>;
		let membershipId: string;
		let memberIds: string[];

		test.beforeAll(async () => {
			const uniqueId = crypto.randomUUID();

			// Create test users
			testUsers = [
				{ id: generateUserId(), email: `bulk-approve-1-${uniqueId}@example.com` },
				{ id: generateUserId(), email: `bulk-approve-2-${uniqueId}@example.com` },
				{ id: generateUserId(), email: `bulk-approve-3-${uniqueId}@example.com` },
			];

			await db.insert(table.user).values(
				testUsers.map((u) => ({
					id: u.id,
					email: u.email,
					firstNames: "Bulk Test",
					lastName: "User",
					homeMunicipality: "Helsinki",
					isAdmin: false,
				})),
			);

			// Get a membership
			const [membership] = await db
				.select()
				.from(table.membership)
				.where(eq(table.membership.membershipTypeId, "varsinainen-jasen"))
				.limit(1);
			if (!membership) throw new Error("Membership not found");
			membershipId = membership.id;

			// Create members with awaiting_approval status
			memberIds = testUsers.map(() => generateUserId());
			await db.insert(table.member).values(
				testUsers.map((u, i) => {
					const id = memberIds[i];
					if (!id) throw new Error("Member ID not found");
					return {
						id,
						userId: u.id,
						membershipId: membershipId,
						status: "awaiting_approval" as const,
					};
				}),
			);
		});

		test.afterAll(async () => {
			// Clean up
			for (const id of memberIds) {
				await db.delete(table.member).where(eq(table.member.id, id));
			}
			for (const u of testUsers) {
				await db.delete(table.user).where(eq(table.user.id, u.id));
			}
		});

		test("bulk approve action approves all selected members", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/members");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Filter by awaiting approval status
			await adminPage.getByRole("button", { name: "Odottaa hyväksyntää" }).click();

			// Search for our test users
			await adminPage.getByPlaceholder("Hae jäseniä").fill("bulk-approve");

			// Wait for filtered results - all 3 should be visible
			const firstTestUser = testUsers[0];
			const secondTestUser = testUsers[1];
			const thirdTestUser = testUsers[2];
			if (!firstTestUser || !secondTestUser || !thirdTestUser) throw new Error("Test user not found");
			await expect(adminPage.getByText(firstTestUser.email)).toBeVisible();
			await expect(adminPage.getByText(secondTestUser.email)).toBeVisible();
			await expect(adminPage.getByText(thirdTestUser.email)).toBeVisible();

			// Select all filtered rows
			const selectAllCheckbox = adminPage.getByTestId("select-all-checkbox");
			await selectAllCheckbox.click();

			// Toolbar should appear with approve button
			const toolbar = adminPage.getByTestId("bulk-action-toolbar");
			await expect(toolbar).toBeVisible();
			await expect(adminPage.getByTestId("bulk-approve-button")).toBeVisible();

			// Click bulk approve
			await adminPage.getByTestId("bulk-approve-button").click();

			// Wait for toolbar to disappear (indicates action completed)
			await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

			// Verify via UI: members should no longer appear in "awaiting approval" filter
			// (they are now active, so they won't match the current filter)
			await expect(adminPage.getByText(firstTestUser.email)).not.toBeVisible();
			await expect(adminPage.getByText(secondTestUser.email)).not.toBeVisible();
			await expect(adminPage.getByText(thirdTestUser.email)).not.toBeVisible();

			// Additionally verify they appear in the "active" filter
			await adminPage.getByRole("button", { name: "Aktiivinen" }).click();
			await adminPage.getByPlaceholder("Hae jäseniä").fill("bulk-approve");
			await expect(adminPage.getByText(firstTestUser.email)).toBeVisible();
			await expect(adminPage.getByText(secondTestUser.email)).toBeVisible();
			await expect(adminPage.getByText(thirdTestUser.email)).toBeVisible();
		});
	});

	test.describe("Bulk Actions Based on Status", () => {
		let testUser: { id: string; email: string };
		let membershipId: string;
		let memberId: string;

		test.beforeEach(async () => {
			const uniqueId = crypto.randomUUID();

			testUser = { id: generateUserId(), email: `bulk-status-${uniqueId}@example.com` };

			await db.insert(table.user).values({
				id: testUser.id,
				email: testUser.email,
				firstNames: "Status Test",
				lastName: "User",
				homeMunicipality: "Helsinki",
				isAdmin: false,
			});

			// Get a membership
			const [membership] = await db
				.select()
				.from(table.membership)
				.where(eq(table.membership.membershipTypeId, "varsinainen-jasen"))
				.limit(1);
			if (!membership) throw new Error("Membership not found");
			membershipId = membership.id;

			memberId = generateUserId();
		});

		test.afterEach(async () => {
			await db.delete(table.member).where(eq(table.member.id, memberId));
			await db.delete(table.user).where(eq(table.user.id, testUser.id));
		});

		test("shows reject button for awaiting_approval members", async ({ adminPage }) => {
			// Create member with awaiting_approval status
			await db.insert(table.member).values({
				id: memberId,
				userId: testUser.id,
				membershipId: membershipId,
				status: "awaiting_approval",
			});

			await adminPage.goto("/fi/admin/members");
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Filter by awaiting approval
			await adminPage.getByRole("button", { name: "Odottaa hyväksyntää" }).click();
			await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
			await expect(adminPage.getByText(testUser.email)).toBeVisible();

			// Select the row
			await adminPage.getByTestId("row-select-checkbox").first().click();

			// Should see both approve and reject buttons
			await expect(adminPage.getByTestId("bulk-approve-button")).toBeVisible();
			await expect(adminPage.getByTestId("bulk-reject-button")).toBeVisible();
		});

		test("shows mark expired and cancel buttons for active members", async ({ adminPage }) => {
			// Create member with active status
			await db.insert(table.member).values({
				id: memberId,
				userId: testUser.id,
				membershipId: membershipId,
				status: "active",
			});

			await adminPage.goto("/fi/admin/members");
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Filter by active
			await adminPage.getByRole("button", { name: "Aktiivinen" }).click();
			await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
			await expect(adminPage.getByText(testUser.email)).toBeVisible();

			// Select the row
			await adminPage.getByTestId("row-select-checkbox").first().click();

			// Should see mark expired and cancel buttons
			await expect(adminPage.getByTestId("bulk-expire-button")).toBeVisible();
			await expect(adminPage.getByTestId("bulk-cancel-button")).toBeVisible();

			// Should NOT see approve/reject/reactivate buttons
			await expect(adminPage.getByTestId("bulk-approve-button")).not.toBeVisible();
			await expect(adminPage.getByTestId("bulk-reject-button")).not.toBeVisible();
			await expect(adminPage.getByTestId("bulk-reactivate-button")).not.toBeVisible();
		});

		test("shows reactivate button for expired/cancelled members", async ({ adminPage }) => {
			// Create member with expired status
			await db.insert(table.member).values({
				id: memberId,
				userId: testUser.id,
				membershipId: membershipId,
				status: "expired",
			});

			await adminPage.goto("/fi/admin/members");
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Filter by expired
			await adminPage.getByRole("button", { name: "Vanhentunut" }).click();
			await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
			await expect(adminPage.getByText(testUser.email)).toBeVisible();

			// Select the row
			await adminPage.getByTestId("row-select-checkbox").first().click();

			// Should see reactivate button
			await expect(adminPage.getByTestId("bulk-reactivate-button")).toBeVisible();

			// Should NOT see other action buttons
			await expect(adminPage.getByTestId("bulk-approve-button")).not.toBeVisible();
			await expect(adminPage.getByTestId("bulk-reject-button")).not.toBeVisible();
			await expect(adminPage.getByTestId("bulk-expire-button")).not.toBeVisible();
			await expect(adminPage.getByTestId("bulk-cancel-button")).not.toBeVisible();
		});

		test("bulk reactivate works for expired members", async ({ adminPage }) => {
			// Create member with expired status
			await db.insert(table.member).values({
				id: memberId,
				userId: testUser.id,
				membershipId: membershipId,
				status: "expired",
			});

			await adminPage.goto("/fi/admin/members");
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Filter by expired
			await adminPage.getByRole("button", { name: "Vanhentunut" }).click();
			await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
			await expect(adminPage.getByText(testUser.email)).toBeVisible();

			// Select the row
			await adminPage.getByTestId("row-select-checkbox").first().click();

			// Click bulk reactivate
			await adminPage.getByTestId("bulk-reactivate-button").click();

			// Wait for toolbar to disappear (indicates action completed)
			await expect(adminPage.getByTestId("bulk-action-toolbar")).not.toBeVisible();

			// Verify via UI: member should no longer appear in "expired" filter
			await expect(adminPage.getByText(testUser.email)).not.toBeVisible();

			// Verify member now appears in "active" filter
			await adminPage.getByRole("button", { name: "Aktiivinen" }).click();
			await adminPage.getByPlaceholder("Hae jäseniä").fill(testUser.email);
			await expect(adminPage.getByText(testUser.email)).toBeVisible();
		});
	});

	test.describe("Mixed Status Selection", () => {
		let testUsers: Array<{ id: string; email: string }>;
		let membershipId: string;
		let memberIds: string[];

		test.beforeAll(async () => {
			const uniqueId = crypto.randomUUID();

			// Create test users with different statuses
			testUsers = [
				{ id: generateUserId(), email: `bulk-mixed-1-${uniqueId}@example.com` },
				{ id: generateUserId(), email: `bulk-mixed-2-${uniqueId}@example.com` },
			];

			await db.insert(table.user).values(
				testUsers.map((u) => ({
					id: u.id,
					email: u.email,
					firstNames: "Mixed Test",
					lastName: "User",
					homeMunicipality: "Helsinki",
					isAdmin: false,
				})),
			);

			// Get a membership
			const [membership] = await db
				.select()
				.from(table.membership)
				.where(eq(table.membership.membershipTypeId, "varsinainen-jasen"))
				.limit(1);
			if (!membership) throw new Error("Membership not found");
			membershipId = membership.id;

			memberIds = [generateUserId(), generateUserId()];

			// Create one active member and one awaiting_approval member
			const [memberId0, memberId1] = memberIds;
			const [user0, user1] = testUsers;
			if (!memberId0 || !memberId1 || !user0 || !user1) throw new Error("Test data not found");
			await db.insert(table.member).values([
				{
					id: memberId0,
					userId: user0.id,
					membershipId: membershipId,
					status: "active",
				},
				{
					id: memberId1,
					userId: user1.id,
					membershipId: membershipId,
					status: "awaiting_approval",
				},
			]);
		});

		test.afterAll(async () => {
			for (const id of memberIds) {
				await db.delete(table.member).where(eq(table.member.id, id));
			}
			for (const u of testUsers) {
				await db.delete(table.user).where(eq(table.user.id, u.id));
			}
		});

		test("shows appropriate buttons for mixed status selection", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/members");
			await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäseniä" })).toBeVisible();

			// Search for our test users
			await adminPage.getByPlaceholder("Hae jäseniä").fill("bulk-mixed");

			// Wait for results
			const user0 = testUsers[0];
			const user1 = testUsers[1];
			if (!user0 || !user1) throw new Error("Test users not found");
			await expect(adminPage.getByText(user0.email)).toBeVisible();
			await expect(adminPage.getByText(user1.email)).toBeVisible();

			// Select all
			await adminPage.getByTestId("select-all-checkbox").click();

			// Toolbar should show buttons for both status types
			// Approve button (for awaiting_approval)
			await expect(adminPage.getByTestId("bulk-approve-button")).toBeVisible();
			// Mark expired button (for active)
			await expect(adminPage.getByTestId("bulk-expire-button")).toBeVisible();
		});
	});
});
