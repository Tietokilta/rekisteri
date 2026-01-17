import { test, expect } from "./fixtures/auth";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { generateUserId } from "../src/lib/server/auth/utils";

test.describe("User Merge Feature", () => {
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

	test.describe("UI Access", () => {
		// Create isolated test user for UI access tests
		let testUser: { id: string; email: string };

		test.beforeAll(async () => {
			testUser = {
				id: generateUserId(),
				email: `ui-access-test-${crypto.randomUUID()}@example.com`,
			};

			await db.insert(table.user).values({
				id: testUser.id,
				email: testUser.email,
				firstNames: "UI Access",
				lastName: "Test",
				isAdmin: false,
			});
		});

		test.afterAll(async () => {
			await db.delete(table.user).where(eq(table.user.id, testUser.id));
		});

		test("merge button is visible for admin users", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users");

			// Wait for page to load by checking for heading
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Find merge button in table body (skip header row)
			const mergeButton = adminPage
				.locator("tbody")
				.getByRole("row")
				.first()
				.getByRole("button", { name: "Yhdistä käyttäjät" });
			await expect(mergeButton).toBeVisible();
		});

		test("clicking merge button opens the merge wizard", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Search for our test user to get a specific merge button
			const searchInput = adminPage.getByPlaceholder("Hae käyttäjiä");
			await searchInput.fill(testUser.email);

			// Wait for the specific user to appear in a table row
			await expect(adminPage.getByRole("row").filter({ hasText: testUser.email })).toBeVisible();

			// Click the merge button for this user
			await adminPage
				.getByRole("row")
				.filter({ hasText: testUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			// Verify the merge wizard appears using testid and step 1 text
			const mergeWizard = adminPage.getByTestId("merge-wizard");
			await expect(mergeWizard).toBeVisible();
			await expect(mergeWizard.getByText("Vaihe 1: Valitse yhdistettävä käyttäjä")).toBeVisible();
		});
	});

	test.describe("Negative Cases - Validation", () => {
		let primaryUser: { id: string; email: string };
		let secondaryUser: { id: string; email: string };
		let membershipId: string;

		test.beforeAll(async () => {
			// Create test users with unique emails
			const uniqueId = crypto.randomUUID();
			primaryUser = {
				id: generateUserId(),
				email: `merge-primary-${uniqueId}@example.com`,
			};

			secondaryUser = {
				id: generateUserId(),
				email: `merge-secondary-${uniqueId}@example.com`,
			};

			await db.insert(table.user).values([
				{
					id: primaryUser.id,
					email: primaryUser.email,
					firstNames: "Primary",
					lastName: "User",
					isAdmin: false,
				},
				{
					id: secondaryUser.id,
					email: secondaryUser.email,
					firstNames: "Secondary",
					lastName: "User",
					isAdmin: false,
				},
			]);

			// Get an existing membership for overlapping test
			const [membership] = await db
				.select()
				.from(table.membership)
				.where(eq(table.membership.membershipTypeId, "varsinainen-jasen"))
				.limit(1);
			if (!membership) throw new Error("Membership not found");
			membershipId = membership.id;
		});

		test.afterAll(async () => {
			// Clean up test data
			await db.delete(table.member).where(eq(table.member.userId, primaryUser.id));
			await db.delete(table.member).where(eq(table.member.userId, secondaryUser.id));
			await db.delete(table.user).where(eq(table.user.id, primaryUser.id));
			await db.delete(table.user).where(eq(table.user.id, secondaryUser.id));
		});

		test("cannot merge when overlapping memberships exist", async ({ adminPage }) => {
			// Add the same membership to both users
			await db.insert(table.member).values([
				{
					id: generateUserId(),
					userId: primaryUser.id,
					membershipId: membershipId,
					status: "active",
				},
				{
					id: generateUserId(),
					userId: secondaryUser.id,
					membershipId: membershipId,
					status: "active",
				},
			]);

			await adminPage.goto("/fi/admin/users");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Search for primary user
			const searchInput = adminPage.getByPlaceholder("Hae käyttäjiä");
			await searchInput.fill(primaryUser.email);

			// Wait for the user to appear in a table row
			await expect(adminPage.getByRole("row").filter({ hasText: primaryUser.email })).toBeVisible();

			// Click merge button for primary user
			await adminPage
				.getByRole("row")
				.filter({ hasText: primaryUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			// Wait for merge wizard to open
			const mergeWizard = adminPage.getByTestId("merge-wizard");
			await expect(mergeWizard.getByText("Vaihe 1: Valitse yhdistettävä käyttäjä")).toBeVisible();

			// Search for secondary user within wizard
			const secondarySearchInput = mergeWizard.getByPlaceholder("Hae käyttäjiä sähköpostilla");
			await secondarySearchInput.fill(secondaryUser.email);

			// Wait for and click on secondary user to select
			const secondaryUserButton = mergeWizard.getByRole("button", { name: secondaryUser.email });
			await expect(secondaryUserButton).toBeVisible();
			await secondaryUserButton.click();

			// Should move to step 2
			await expect(mergeWizard.getByText("Vaihe 2: Tarkista yhdistettävät tiedot")).toBeVisible();

			// Click next to go to step 3
			await mergeWizard.getByRole("button", { name: "Seuraava" }).click();

			// Should be on step 3
			await expect(mergeWizard.getByText("Vaihe 3: Vahvista yhdistäminen")).toBeVisible();

			// Fill in email confirmations - emails are now shown above inputs, not as placeholders
			const emailInputs = mergeWizard.locator('input[type="email"]');
			await emailInputs.first().fill(primaryUser.email);
			await emailInputs.last().fill(secondaryUser.email);

			// Click merge button using testid
			await adminPage.getByTestId("merge-submit-button").click();

			// Merge should fail due to overlapping memberships
			// Wait for error toast to appear (indicates merge failed)
			await expect(adminPage.locator('[data-sonner-toast][data-type="error"]')).toBeVisible();

			// Verify wizard is still visible (didn't close on success)
			await expect(mergeWizard).toBeVisible();

			// Verify secondary user was NOT deleted (merge failed)
			const [userStillExists] = await db.select().from(table.user).where(eq(table.user.id, secondaryUser.id)).limit(1);
			expect(userStillExists).toBeDefined();

			// Clean up the memberships for next tests
			await db
				.delete(table.member)
				.where(and(eq(table.member.userId, primaryUser.id), eq(table.member.membershipId, membershipId)));
			await db
				.delete(table.member)
				.where(and(eq(table.member.userId, secondaryUser.id), eq(table.member.membershipId, membershipId)));
		});

		test("email confirmation must match exactly", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Search for primary user
			const searchInput = adminPage.getByPlaceholder("Hae käyttäjiä");
			await searchInput.fill(primaryUser.email);

			// Wait for the user to appear in a table row
			await expect(adminPage.getByRole("row").filter({ hasText: primaryUser.email })).toBeVisible();

			// Click merge button
			await adminPage
				.getByRole("row")
				.filter({ hasText: primaryUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			// Get the merge wizard
			const mergeWizard = adminPage.getByTestId("merge-wizard");

			// Search for secondary user within wizard
			const secondarySearchInput = mergeWizard.getByPlaceholder("Hae käyttäjiä sähköpostilla");
			await secondarySearchInput.fill(secondaryUser.email);

			// Select secondary user
			const secondaryUserButton = mergeWizard.getByRole("button", { name: secondaryUser.email });
			await expect(secondaryUserButton).toBeVisible();
			await secondaryUserButton.click();

			// Go to step 3
			await mergeWizard.getByRole("button", { name: "Seuraava" }).click();

			// Get the email inputs within wizard
			const emailInputs = mergeWizard.locator('input[type="email"]');

			// Try with incorrect emails
			await emailInputs.first().fill("wrong@email.com");
			await emailInputs.last().fill("also-wrong@email.com");

			// Merge button should be disabled - use testid
			const mergeButton = adminPage.getByTestId("merge-submit-button");
			await expect(mergeButton).toBeDisabled();

			// Fill with correct primary email but wrong secondary
			await emailInputs.first().fill(primaryUser.email);
			await emailInputs.last().fill("wrong@email.com");

			// Should still be disabled
			await expect(mergeButton).toBeDisabled();

			// Fill with correct emails (case insensitive)
			await emailInputs.first().fill(primaryUser.email.toUpperCase());
			await emailInputs.last().fill(secondaryUser.email);

			// Should be enabled now
			await expect(mergeButton).toBeEnabled();
		});
	});

	test.describe("Positive Cases - Successful Merge", () => {
		let primaryUser: { id: string; email: string };
		let secondaryUser: { id: string; email: string };
		let membership2024: string;
		let membership2023: string;
		let secondaryEmailAddress: string;

		test.beforeAll(async () => {
			// Create fresh test users with unique emails
			const uniqueId = crypto.randomUUID();
			primaryUser = {
				id: generateUserId(),
				email: `merge-success-primary-${uniqueId}@example.com`,
			};

			secondaryUser = {
				id: generateUserId(),
				email: `merge-success-secondary-${uniqueId}@example.com`,
			};

			secondaryEmailAddress = `secondary-extra-${uniqueId}@aalto.fi`;

			await db.insert(table.user).values([
				{
					id: primaryUser.id,
					email: primaryUser.email,
					firstNames: "Success Primary",
					lastName: "Test",
					homeMunicipality: "Helsinki",
					isAdmin: false,
				},
				{
					id: secondaryUser.id,
					email: secondaryUser.email,
					firstNames: "Success Secondary",
					lastName: "Test",
					homeMunicipality: "Espoo",
					isAdmin: false,
				},
			]);

			// Get different memberships for non-overlapping test
			const memberships = await db
				.select()
				.from(table.membership)
				.where(eq(table.membership.membershipTypeId, "varsinainen-jasen"))
				.limit(2);
			if (!memberships[0] || !memberships[1]) throw new Error("Memberships not found");
			membership2024 = memberships[0].id;
			membership2023 = memberships[1].id;

			// Add different memberships to each user (no overlap)
			await db.insert(table.member).values([
				{
					id: generateUserId(),
					userId: primaryUser.id,
					membershipId: membership2024,
					status: "active",
				},
				{
					id: generateUserId(),
					userId: secondaryUser.id,
					membershipId: membership2023,
					status: "active",
				},
			]);

			// Add a secondary email to secondary user
			await db.insert(table.secondaryEmail).values({
				id: crypto.randomUUID(),
				userId: secondaryUser.id,
				email: secondaryEmailAddress,
				domain: "aalto.fi",
				verifiedAt: new Date(),
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180), // 6 months
			});
		});

		test("successfully merges two users with all data", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Search for primary user
			const searchInput = adminPage.getByPlaceholder("Hae käyttäjiä");
			await searchInput.fill(primaryUser.email);

			// Wait for the user to appear in a table row
			await expect(adminPage.getByRole("row").filter({ hasText: primaryUser.email })).toBeVisible();

			// Click merge button for this specific user
			await adminPage
				.getByRole("row")
				.filter({ hasText: primaryUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			// Wait for wizard
			const mergeWizard = adminPage.getByTestId("merge-wizard");
			await expect(mergeWizard.getByText("Vaihe 1: Valitse yhdistettävä käyttäjä")).toBeVisible();

			// Verify primary user is shown in the card
			await expect(mergeWizard.locator(".bg-muted").getByText(primaryUser.email)).toBeVisible();

			// Search for secondary user within wizard
			const secondarySearchInput = mergeWizard.getByPlaceholder("Hae käyttäjiä sähköpostilla");
			await secondarySearchInput.fill(secondaryUser.email);

			// Wait for and select secondary user
			const secondaryUserButton = mergeWizard.getByRole("button", { name: secondaryUser.email });
			await expect(secondaryUserButton).toBeVisible();
			await secondaryUserButton.click();

			// Should be on step 2
			await expect(mergeWizard.getByText("Vaihe 2: Tarkista yhdistettävät tiedot")).toBeVisible();

			// Verify both users are shown in the review (scoped to wizard)
			await expect(mergeWizard.getByText(primaryUser.email).first()).toBeVisible();
			await expect(mergeWizard.getByText(secondaryUser.email).first()).toBeVisible();

			// Go to confirmation step
			await mergeWizard.getByRole("button", { name: "Seuraava" }).click();

			// Fill in confirmations - emails are displayed above the inputs
			const emailInputs = mergeWizard.locator('input[type="email"]');
			await emailInputs.first().fill(primaryUser.email);
			await emailInputs.last().fill(secondaryUser.email);

			// Click merge using testid
			await adminPage.getByTestId("merge-submit-button").click();

			// Wait for wizard to close (indicates merge succeeded)
			await expect(adminPage.getByTestId("merge-wizard")).not.toBeVisible();

			// Wait for success toast to confirm operation completed
			await expect(adminPage.locator('[data-sonner-toast][data-type="success"]')).toBeVisible();

			// Verify data integrity in database
			// 1. Secondary user should be deleted
			const [deletedUser] = await db.select().from(table.user).where(eq(table.user.id, secondaryUser.id)).limit(1);
			expect(deletedUser).toBeUndefined();

			// 2. Primary user should still exist
			const [existingPrimaryUser] = await db
				.select()
				.from(table.user)
				.where(eq(table.user.id, primaryUser.id))
				.limit(1);
			expect(existingPrimaryUser).toBeDefined();
			expect(existingPrimaryUser?.email).toBe(primaryUser.email);

			// 3. Secondary user's email should be added as secondary email on primary user
			const secondaryEmails = await db
				.select()
				.from(table.secondaryEmail)
				.where(
					and(eq(table.secondaryEmail.userId, primaryUser.id), eq(table.secondaryEmail.email, secondaryUser.email)),
				);
			expect(secondaryEmails.length).toBe(1);
			expect(secondaryEmails[0]?.verifiedAt).not.toBeNull();

			// 4. All memberships should now belong to primary user
			const members = await db.select().from(table.member).where(eq(table.member.userId, primaryUser.id));
			expect(members.length).toBe(2); // Should have both memberships now

			const membershipIds = members.map((m) => m.membershipId).toSorted();
			expect(membershipIds).toContain(membership2024);
			expect(membershipIds).toContain(membership2023);

			// 5. Secondary user's old secondary emails should be transferred
			const transferredSecondaryEmails = await db
				.select()
				.from(table.secondaryEmail)
				.where(
					and(eq(table.secondaryEmail.userId, primaryUser.id), eq(table.secondaryEmail.email, secondaryEmailAddress)),
				);
			expect(transferredSecondaryEmails.length).toBe(1);

			// 6. Audit log should contain merge entry
			const auditLogs = await db
				.select()
				.from(table.auditLog)
				.where(and(eq(table.auditLog.action, "user.merge"), eq(table.auditLog.targetId, primaryUser.id)))
				.limit(1);
			expect(auditLogs.length).toBe(1);
			expect(auditLogs[0]?.metadata).toMatchObject({
				primaryUserEmail: primaryUser.email,
				secondaryUserEmail: secondaryUser.email,
			});
		});

		test.afterAll(async () => {
			// Clean up - only primary user should exist now
			await db.delete(table.member).where(eq(table.member.userId, primaryUser.id));
			await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, primaryUser.id));
			await db.delete(table.user).where(eq(table.user.id, primaryUser.id));
		});
	});

	test.describe("Edge Cases", () => {
		// Create isolated test users for edge case tests
		let testUser: { id: string; email: string };
		let testUser2: { id: string; email: string };

		test.beforeAll(async () => {
			const uniqueId = crypto.randomUUID();
			testUser = {
				id: generateUserId(),
				email: `edge-case-1-${uniqueId}@example.com`,
			};
			testUser2 = {
				id: generateUserId(),
				email: `edge-case-2-${uniqueId}@example.com`,
			};

			await db.insert(table.user).values([
				{
					id: testUser.id,
					email: testUser.email,
					firstNames: "Edge Case",
					lastName: "One",
					isAdmin: false,
				},
				{
					id: testUser2.id,
					email: testUser2.email,
					firstNames: "Edge Case",
					lastName: "Two",
					isAdmin: false,
				},
			]);
		});

		test.afterAll(async () => {
			await db.delete(table.user).where(eq(table.user.id, testUser.id));
			await db.delete(table.user).where(eq(table.user.id, testUser2.id));
		});

		test("wizard can be closed and reopened", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Search for our test user
			const searchInput = adminPage.getByPlaceholder("Hae käyttäjiä");
			await searchInput.fill(testUser.email);
			await expect(adminPage.getByRole("row").filter({ hasText: testUser.email })).toBeVisible();

			// Open wizard
			await adminPage
				.getByRole("row")
				.filter({ hasText: testUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			const mergeWizard = adminPage.getByTestId("merge-wizard");
			await expect(mergeWizard).toBeVisible();
			await expect(mergeWizard.getByText("Vaihe 1: Valitse yhdistettävä käyttäjä")).toBeVisible();

			// Close wizard with X button
			await adminPage.getByTestId("merge-wizard-close").click();

			// Wizard should be gone
			await expect(adminPage.getByTestId("merge-wizard")).not.toBeVisible();

			// Should be able to open it again
			await adminPage
				.getByRole("row")
				.filter({ hasText: testUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			await expect(
				adminPage.getByTestId("merge-wizard").getByText("Vaihe 1: Valitse yhdistettävä käyttäjä"),
			).toBeVisible();
		});

		test("can navigate back through wizard steps", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users");

			// Wait for page to load
			await expect(adminPage.getByRole("heading", { name: "Käyttäjät" })).toBeVisible();

			// Search for our test user
			const searchInput = adminPage.getByPlaceholder("Hae käyttäjiä");
			await searchInput.fill(testUser.email);
			await expect(adminPage.getByRole("row").filter({ hasText: testUser.email })).toBeVisible();

			// Open wizard
			await adminPage
				.getByRole("row")
				.filter({ hasText: testUser.email })
				.getByRole("button", { name: "Yhdistä käyttäjät" })
				.click();

			// Get the merge wizard
			const mergeWizard = adminPage.getByTestId("merge-wizard");

			// Search for second test user within wizard
			const secondarySearchInput = mergeWizard.getByPlaceholder("Hae käyttäjiä sähköpostilla");
			await secondarySearchInput.fill(testUser2.email);

			// Wait for and click the user button
			const userButton = mergeWizard.getByRole("button", { name: testUser2.email });
			await expect(userButton).toBeVisible();
			await userButton.click();

			// Should be on step 2
			await expect(mergeWizard.getByText("Vaihe 2: Tarkista yhdistettävät tiedot")).toBeVisible();

			// Click previous
			await mergeWizard.getByRole("button", { name: "Edellinen" }).click();

			// Should be back on step 1
			await expect(mergeWizard.getByText("Vaihe 1: Valitse yhdistettävä käyttäjä")).toBeVisible();
		});
	});
});
