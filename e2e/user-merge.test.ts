import { test, expect } from "./fixtures/auth";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, and } from "drizzle-orm";
import { generateUserId } from "../src/lib/server/auth/utils";
import { loadEnvFile } from "./utils";

loadEnvFile();

const dbUrl = process.env.DATABASE_URL_TEST;
if (!dbUrl) {
	throw new Error("DATABASE_URL_TEST not set");
}

test.describe("User Merge Feature", () => {
	let db: ReturnType<typeof drizzle>;
	let client: ReturnType<typeof postgres>;

	test.beforeAll(async () => {
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});

	test.describe("UI Access", () => {
		test("merge button is visible for admin users", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Wait for table to load
			await expect(adminPage.locator("table")).toBeVisible();

			// Find the first merge button (there should be one for each user)
			const mergeButton = adminPage.locator('button[title*="Yhdistä"]').first();
			await expect(mergeButton).toBeVisible();
		});

		test("clicking merge button opens the merge wizard", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Click the first merge button
			const mergeButton = adminPage.locator('button[title*="Yhdistä"]').first();
			await mergeButton.click();

			// Verify the merge modal/card appears
			await expect(adminPage.locator('text="Yhdistä käyttäjät"')).toBeVisible();
			await expect(adminPage.locator('text="Vaihe 1: Valitse yhdistettävä käyttäjä"')).toBeVisible();
		});
	});

	test.describe("Negative Cases - Validation", () => {
		let primaryUser: { id: string; email: string };
		let secondaryUser: { id: string; email: string };
		let membershipId: string;

		test.beforeAll(async () => {
			// Create test users
			primaryUser = {
				id: generateUserId(),
				email: "merge-primary-test@example.com",
			};

			secondaryUser = {
				id: generateUserId(),
				email: "merge-secondary-test@example.com",
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
				.where(eq(table.membership.type, "varsinainen jäsen"))
				.limit(1);
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

			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Search for primary user
			const searchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä"]');
			await searchInput.fill(primaryUser.email);

			// Click merge button for primary user
			await adminPage.locator('button[title*="Yhdistä"]').first().click();

			// Wait for merge wizard to open
			await expect(adminPage.locator('text="Vaihe 1: Valitse yhdistettävä käyttäjä"')).toBeVisible();

			// Search for secondary user
			const secondarySearchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä sähköpostilla"]');
			await secondarySearchInput.fill(secondaryUser.email);

			// Click on secondary user to select
			await adminPage.locator(`text="${secondaryUser.email}"`).last().click();

			// Should move to step 2
			await expect(adminPage.locator('text="Vaihe 2: Tarkista yhdistettävät tiedot"')).toBeVisible();

			// Click next to go to step 3
			await adminPage.locator('button:has-text("Seuraava")').click();

			// Should be on step 3
			await expect(adminPage.locator('text="Vaihe 3: Vahvista yhdistäminen"')).toBeVisible();

			// Fill in email confirmations
			await adminPage.locator('input[placeholder*="' + primaryUser.email + '"]').fill(primaryUser.email);
			await adminPage.locator('input[placeholder*="' + secondaryUser.email + '"]').fill(secondaryUser.email);

			// Click merge button
			await adminPage.locator('button:has-text("Yhdistä käyttäjät")').click();

			// Should show error about overlapping memberships
			await expect(adminPage.locator("text=/molemmilla käyttäjillä on jäsenyys samalle ajanjaksolle/i")).toBeVisible({
				timeout: 5000,
			});

			// Clean up the memberships for next tests
			await db
				.delete(table.member)
				.where(and(eq(table.member.userId, primaryUser.id), eq(table.member.membershipId, membershipId)));
			await db
				.delete(table.member)
				.where(and(eq(table.member.userId, secondaryUser.id), eq(table.member.membershipId, membershipId)));
		});

		test("email confirmation must match exactly", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Search for primary user
			const searchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä"]');
			await searchInput.fill(primaryUser.email);

			// Click merge button
			await adminPage.locator('button[title*="Yhdistä"]').first().click();

			// Search for secondary user
			const secondarySearchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä sähköpostilla"]');
			await secondarySearchInput.fill(secondaryUser.email);

			// Select secondary user
			await adminPage.locator(`text="${secondaryUser.email}"`).last().click();

			// Go to step 3
			await adminPage.locator('button:has-text("Seuraava")').click();

			// Try with incorrect emails
			await adminPage.locator('input[placeholder*="' + primaryUser.email + '"]').fill("wrong@email.com");
			await adminPage.locator('input[placeholder*="' + secondaryUser.email + '"]').fill("also-wrong@email.com");

			// Merge button should be disabled
			const mergeButton = adminPage.locator('button:has-text("Yhdistä käyttäjät")');
			await expect(mergeButton).toBeDisabled();

			// Fill with correct primary email but wrong secondary
			await adminPage.locator('input[placeholder*="' + primaryUser.email + '"]').fill(primaryUser.email);
			await adminPage.locator('input[placeholder*="' + secondaryUser.email + '"]').fill("wrong@email.com");

			// Should still be disabled
			await expect(mergeButton).toBeDisabled();

			// Fill with correct emails (case insensitive)
			await adminPage.locator('input[placeholder*="' + primaryUser.email + '"]').fill(primaryUser.email.toUpperCase());
			await adminPage.locator('input[placeholder*="' + secondaryUser.email + '"]').fill(secondaryUser.email);

			// Should be enabled now
			await expect(mergeButton).toBeEnabled();
		});
	});

	test.describe("Positive Cases - Successful Merge", () => {
		let primaryUser: { id: string; email: string };
		let secondaryUser: { id: string; email: string };
		let membership2024: string;
		let membership2023: string;
		let secondaryEmailId: string;

		test.beforeAll(async () => {
			// Create fresh test users
			primaryUser = {
				id: generateUserId(),
				email: "merge-success-primary@example.com",
			};

			secondaryUser = {
				id: generateUserId(),
				email: "merge-success-secondary@example.com",
			};

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
				.where(eq(table.membership.type, "varsinainen jäsen"))
				.limit(2);
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
			secondaryEmailId = generateUserId();
			await db.insert(table.secondaryEmail).values({
				id: secondaryEmailId,
				userId: secondaryUser.id,
				email: "secondary-extra@aalto.fi",
				domain: "aalto.fi",
				verifiedAt: new Date(),
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180), // 6 months
			});
		});

		test("successfully merges two users with all data", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Search for primary user
			const searchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä"]');
			await searchInput.fill(primaryUser.email);
			await adminPage.waitForTimeout(500);

			// Click merge button
			await adminPage.locator('button[title*="Yhdistä"]').first().click();

			// Wait for wizard
			await expect(adminPage.locator('text="Vaihe 1: Valitse yhdistettävä käyttäjä"')).toBeVisible();

			// Verify primary user is shown
			await expect(adminPage.locator(`text="${primaryUser.email}"`).first()).toBeVisible();

			// Search for secondary user
			const secondarySearchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä sähköpostilla"]');
			await secondarySearchInput.fill(secondaryUser.email);
			await adminPage.waitForTimeout(500);

			// Select secondary user
			await adminPage.locator(`text="${secondaryUser.email}"`).last().click();

			// Should be on step 2
			await expect(adminPage.locator('text="Vaihe 2: Tarkista yhdistettävät tiedot"')).toBeVisible();

			// Verify both users are shown in the review
			await expect(adminPage.locator(`text="${primaryUser.email}"`)).toBeVisible();
			await expect(adminPage.locator(`text="${secondaryUser.email}"`)).toBeVisible();

			// Go to confirmation step
			await adminPage.locator('button:has-text("Seuraava")').click();

			// Fill in confirmations
			await adminPage.locator('input[placeholder*="' + primaryUser.email + '"]').fill(primaryUser.email);
			await adminPage.locator('input[placeholder*="' + secondaryUser.email + '"]').fill(secondaryUser.email);

			// Click merge
			await adminPage.locator('button:has-text("Yhdistä käyttäjät")').click();

			// Wait for success message
			await expect(adminPage.locator("text=/yhdistetty onnistuneesti/i")).toBeVisible({ timeout: 10_000 });

			// Page should reload - wait for it
			await adminPage.waitForURL(/\/admin\/users/, { timeout: 10_000 });
			await adminPage.waitForLoadState("networkidle");

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
			expect(existingPrimaryUser.email).toBe(primaryUser.email);

			// 3. Secondary user's email should be added as secondary email on primary user
			const secondaryEmails = await db
				.select()
				.from(table.secondaryEmail)
				.where(
					and(eq(table.secondaryEmail.userId, primaryUser.id), eq(table.secondaryEmail.email, secondaryUser.email)),
				);
			expect(secondaryEmails.length).toBe(1);
			expect(secondaryEmails[0].verifiedAt).not.toBeNull();

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
					and(
						eq(table.secondaryEmail.userId, primaryUser.id),
						eq(table.secondaryEmail.email, "secondary-extra@aalto.fi"),
					),
				);
			expect(transferredSecondaryEmails.length).toBe(1);

			// 6. Audit log should contain merge entry
			const auditLogs = await db
				.select()
				.from(table.auditLog)
				.where(and(eq(table.auditLog.action, "user.merge"), eq(table.auditLog.targetId, primaryUser.id)))
				.limit(1);
			expect(auditLogs.length).toBe(1);
			expect(auditLogs[0].metadata).toMatchObject({
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
		test("wizard can be closed and reopened", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Open wizard
			await adminPage.locator('button[title*="Yhdistä"]').first().click();
			await expect(adminPage.locator('text="Yhdistä käyttäjät"')).toBeVisible();

			// Close wizard with X button
			await adminPage.locator('button[aria-label*="close"], button:has(svg)').last().click();

			// Wizard should be gone
			await expect(adminPage.locator('text="Vaihe 1: Valitse yhdistettävä käyttäjä"')).not.toBeVisible();

			// Should be able to open it again
			await adminPage.locator('button[title*="Yhdistä"]').first().click();
			await expect(adminPage.locator('text="Vaihe 1: Valitse yhdistettävä käyttäjä"')).toBeVisible();
		});

		test("can navigate back through wizard steps", async ({ adminPage }) => {
			await adminPage.goto("/fi/admin/users", { waitUntil: "networkidle" });

			// Open wizard and select a user
			await adminPage.locator('button[title*="Yhdistä"]').first().click();

			// Search for any user
			const secondarySearchInput = adminPage.locator('input[placeholder*="Hae käyttäjiä sähköpostilla"]');
			await secondarySearchInput.fill("root");
			await adminPage.waitForTimeout(500);

			// Click on a user (should be at least root@tietokilta.fi)
			const userButtons = await adminPage.locator('button:has-text("@")').all();
			if (userButtons.length > 0) {
				await userButtons[0].click();

				// Should be on step 2
				await expect(adminPage.locator('text="Vaihe 2: Tarkista yhdistettävät tiedot"')).toBeVisible();

				// Click previous
				await adminPage.locator('button:has-text("Edellinen")').click();

				// Should be back on step 1
				await expect(adminPage.locator('text="Vaihe 1: Valitse yhdistettävä käyttäjä"')).toBeVisible();
			}
		});
	});
});
