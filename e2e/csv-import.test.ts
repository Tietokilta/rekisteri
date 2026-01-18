import { test, expect } from "./fixtures/auth";
import path from "node:path";
import fs from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { createVerifiedSecondaryEmail, createUnverifiedSecondaryEmail } from "./helpers/secondary-email";
import { route } from "../src/lib/ROUTES";

test.describe("CSV Import", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

	// Track test data for cleanup
	let testUserIds: string[] = [];
	let tempFiles: string[] = [];

	const getTestEmail = (prefix: string) => `${prefix}-${crypto.randomUUID()}@example.com`;

	test.beforeAll(async () => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});

	test.afterEach(async () => {
		// Clean up test users and their related data
		for (const userId of testUserIds) {
			// Delete in correct order (foreign key constraints)
			await db.delete(table.member).where(eq(table.member.userId, userId));
			await db.delete(table.secondaryEmail).where(eq(table.secondaryEmail.userId, userId));
			await db.delete(table.user).where(eq(table.user.id, userId));
		}
		testUserIds = []; // Reset for next test

		// Clean up temporary CSV files
		for (const tempFile of tempFiles) {
			try {
				if (fs.existsSync(tempFile)) {
					fs.unlinkSync(tempFile);
				}
			} catch {
				// Ignore cleanup errors
			}
		}
		tempFiles = []; // Reset for next test
	});

	// Test file upload with actual CSV file
	test("CSV import shows correct preview", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Upload CSV file using setInputFiles (simpler approach)
		const csvPath = path.join(process.cwd(), "e2e/fixtures/sample-import.csv");
		const fileInput = adminPage.locator('input[type="file"]');

		// Check if file exists before uploading
		if (!fs.existsSync(csvPath)) {
			throw new Error(`Sample CSV not found at ${csvPath}`);
		}

		await fileInput.setInputFiles(csvPath);

		// Verify preview shows
		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible();

		// Check that it shows correct number of users and records
		await expect(adminPage.getByText("Uniikkeja käyttäjiä (luotu tai päivitetty):")).toBeVisible();
		await expect(adminPage.getByText("Luotavia jäsentietueita:")).toBeVisible();

		// Verify table preview shows data
		await expect(adminPage.getByText("CSV-datan esikatselu")).toBeVisible();
		await expect(adminPage.getByRole("cell", { name: "Matti" }).first()).toBeVisible();
	});

	// Test validation with invalid columns using a temporary file
	test("CSV import validates incorrect column format", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Create a temporary CSV file with wrong columns
		const tempPath = path.join(process.cwd(), `temp-invalid-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup
		const invalidCsv = `wrong,columns,here
value1,value2,value3`;
		fs.writeFileSync(tempPath, invalidCsv);

		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		// Verify error message shows
		await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible();
		await expect(adminPage.getByText(/CSV columns don't match/)).toBeVisible();
	});

	test("CSV import validates invalid email format", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Create a temporary CSV file with invalid email
		const tempPath = path.join(process.cwd(), `temp-invalid-email-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup
		const invalidEmailCsv = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,not-an-email,varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, invalidEmailCsv);

		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		// Verify error message shows
		await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible();
		await expect(adminPage.getByText(/Invalid email/)).toBeVisible();
	});

	test("CSV import validates invalid membership type", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Create a temporary CSV file with non-existent membership type
		const tempPath = path.join(process.cwd(), `temp-invalid-type-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup
		const invalidTypeCsv = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,test@example.com,nonexistent-type,2025-08-01`;
		fs.writeFileSync(tempPath, invalidTypeCsv);

		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		// Verify error message shows
		await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible();
		await expect(adminPage.getByText(/Invalid membership types/)).toBeVisible();
	});

	test("CSV import shows existing memberships", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify existing memberships section is visible
		await expect(adminPage.getByText("Olemassa olevat jäsenyydet tietokannassa:")).toBeVisible();
		await expect(adminPage.getByText("CSV-rivien tulee vastata näitä täsmälleen")).toBeVisible();

		// Verify some membership types are listed
		await expect(adminPage.getByText("varsinainen jäsen").first()).toBeVisible();
		await expect(adminPage.getByText("ulkojäsen").first()).toBeVisible();
	});

	test("should attach membership to existing user when CSV email is a verified secondary email", async ({
		adminPage,
	}) => {
		// 1. Set up: Create a test user with a verified secondary email
		const primaryEmail = getTestEmail("primary");
		const secondaryEmail = getTestEmail("secondary");
		const testUserId = crypto.randomUUID();

		// Track for cleanup in afterEach
		testUserIds.push(testUserId);

		// Create test user
		await db.insert(table.user).values({
			id: testUserId,
			email: primaryEmail,
			firstNames: "Original",
			lastName: "Name",
			homeMunicipality: "Tampere",
			isAdmin: false,
			isAllowedEmails: false,
		});

		// Create verified secondary email for test user
		await createVerifiedSecondaryEmail(db, testUserId, secondaryEmail);

		// 2. Count users before import
		const usersBeforeImport = await db.select().from(table.user);
		const initialUserCount = usersBeforeImport.length;

		// 3. Create CSV with the secondary email
		const tempPath = path.join(process.cwd(), `temp-csv-import-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup
		const csvContent = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,${secondaryEmail},varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, csvContent);

		// 4. Navigate to import page and upload CSV
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});
		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		// Wait for file to be parsed and preview to show
		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

		// 5. Execute the import
		const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
		await importButton.click();

		// Wait for success message
		await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

		// 6. Verify NO duplicate user was created
		const usersAfterImport = await db.select().from(table.user);
		expect(usersAfterImport.length).toBe(initialUserCount);

		// 7. Verify the user was NOT created with secondary email as primary
		const duplicateUser = await db.select().from(table.user).where(eq(table.user.email, secondaryEmail));
		expect(duplicateUser.length).toBe(0);

		// 8. Verify membership was attached to the EXISTING test user
		const testUserMembers = await db.select().from(table.member).where(eq(table.member.userId, testUserId));

		// Test user should now have at least one member record
		expect(testUserMembers.length).toBeGreaterThan(0);

		// 9. Verify the test user's details were updated from the CSV
		const [updatedUser] = await db.select().from(table.user).where(eq(table.user.id, testUserId));
		expect(updatedUser?.firstNames).toBe("Test");
		expect(updatedUser?.lastName).toBe("User");
		expect(updatedUser?.homeMunicipality).toBe("Helsinki");
	});

	test("should NOT match unverified secondary emails during CSV import", async ({ adminPage }) => {
		// 1. Set up: Create a test user with an UNVERIFIED secondary email
		const primaryEmail = getTestEmail("primary");
		const unverifiedEmail = getTestEmail("unverified");
		const testUserId = crypto.randomUUID();

		// Track for cleanup in afterEach
		testUserIds.push(testUserId);

		// Create test user
		await db.insert(table.user).values({
			id: testUserId,
			email: primaryEmail,
			firstNames: "Existing",
			lastName: "User",
			homeMunicipality: "Tampere",
			isAdmin: false,
			isAllowedEmails: false,
		});

		// Create unverified secondary email for test user
		await createUnverifiedSecondaryEmail(db, testUserId, unverifiedEmail);

		// 2. Count users before import
		const usersBeforeImport = await db.select().from(table.user);
		const initialUserCount = usersBeforeImport.length;

		// 3. Create CSV with the unverified secondary email
		const tempPath = path.join(process.cwd(), `temp-csv-import-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup
		const csvContent = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
New,Person,Espoo,${unverifiedEmail},varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, csvContent);

		// 4. Navigate to import page and upload CSV
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});
		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		// Wait for file to be parsed and preview to show
		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

		// 5. Execute the import
		const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
		await importButton.click();

		// Wait for success message
		await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

		// 6. Verify a NEW user WAS created (since unverified emails shouldn't match)
		const usersAfterImport = await db.select().from(table.user);
		expect(usersAfterImport.length).toBe(initialUserCount + 1);

		// 7. Verify the new user has the unverified email as their PRIMARY email
		const [newUser] = await db.select().from(table.user).where(eq(table.user.email, unverifiedEmail));
		expect(newUser).toBeDefined();
		expect(newUser?.email).toBe(unverifiedEmail);
		expect(newUser?.firstNames).toBe("New");
		expect(newUser?.lastName).toBe("Person");

		// 8. Track the newly created user for cleanup
		if (newUser) {
			testUserIds.push(newUser.id);
		}
	});

	test("CSV import handles large batches (2000 rows)", async ({ adminPage }) => {
		// Generate a CSV with 2000 rows
		const rowCount = 2000;
		const tempPath = path.join(process.cwd(), `temp-large-import-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup

		// Create CSV header
		let csvContent = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate\n`;

		// Generate 2000 unique rows
		const generatedEmails: string[] = [];
		for (let i = 0; i < rowCount; i++) {
			const email = `batch-test-${i}-${crypto.randomUUID()}@example.com`;
			generatedEmails.push(email);
			csvContent += `FirstName${i},LastName${i},Helsinki,${email},varsinainen jäsen,2025-08-01\n`;
		}

		fs.writeFileSync(tempPath, csvContent);

		// Navigate to import page and upload CSV
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});
		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		// Wait for file to be parsed and preview to show
		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

		// Verify the preview shows - check for the label, not the count (count appears multiple times)
		await expect(adminPage.getByText("Luotavia jäsentietueita:")).toBeVisible();

		// Execute the import
		const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
		await importButton.click();

		// Wait for success message (give it more time for large import)
		await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 60_000 });

		// Verify success count - use regex to match the format "Tuotiin X / Y jäsentä"
		await expect(adminPage.getByText(new RegExp(`Tuotiin ${rowCount} / ${rowCount}`))).toBeVisible();

		// Verify users were created in database
		const createdUsers = await db
			.select()
			.from(table.user)
			.where(inArray(table.user.email, generatedEmails.slice(0, 10))); // Check first 10

		expect(createdUsers.length).toBe(10);

		// Track all created users for cleanup
		const allCreatedUsers = await db.select().from(table.user).where(inArray(table.user.email, generatedEmails));
		for (const user of allCreatedUsers) {
			testUserIds.push(user.id);
		}

		// Verify members were created
		const createdMembers = await db
			.select()
			.from(table.member)
			.where(
				inArray(
					table.member.userId,
					allCreatedUsers.map((u) => u.id),
				),
			);

		expect(createdMembers.length).toBe(rowCount);
	});

	test("CSV import is idempotent (running twice doesn't duplicate)", async ({ adminPage }) => {
		// Create a CSV with a few rows
		const tempPath = path.join(process.cwd(), `temp-idempotent-${crypto.randomUUID()}.csv`);
		tempFiles.push(tempPath); // Track for cleanup

		const email1 = getTestEmail("idempotent1");
		const email2 = getTestEmail("idempotent2");
		const email3 = getTestEmail("idempotent3");

		const csvContent = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Alice,Smith,Helsinki,${email1},varsinainen jäsen,2025-08-01
Bob,Jones,Tampere,${email2},varsinainen jäsen,2025-08-01
Charlie,Brown,Espoo,${email3},varsinainen jäsen,2025-08-01`;

		fs.writeFileSync(tempPath, csvContent);

		// First import
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});
		const fileInput = adminPage.locator('input[type="file"]');
		await fileInput.setInputFiles(tempPath);

		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

		const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
		await importButton.click();

		await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

		// Get counts after first import
		const usersAfterFirstImport = await db
			.select()
			.from(table.user)
			.where(inArray(table.user.email, [email1, email2, email3]));

		expect(usersAfterFirstImport.length).toBe(3);

		// Track for cleanup
		for (const user of usersAfterFirstImport) {
			testUserIds.push(user.id);
		}

		const membersAfterFirstImport = await db
			.select()
			.from(table.member)
			.where(
				inArray(
					table.member.userId,
					usersAfterFirstImport.map((u) => u.id),
				),
			);

		expect(membersAfterFirstImport.length).toBe(3);

		// Second import (same CSV)
		await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Re-query elements after navigation to avoid stale references
		const fileInput2 = adminPage.locator('input[type="file"]');
		await fileInput2.setInputFiles(tempPath);

		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

		const importButton2 = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
		await importButton2.click();

		await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

		// Get counts after second import
		const usersAfterSecondImport = await db
			.select()
			.from(table.user)
			.where(inArray(table.user.email, [email1, email2, email3]));

		const membersAfterSecondImport = await db
			.select()
			.from(table.member)
			.where(
				inArray(
					table.member.userId,
					usersAfterSecondImport.map((u) => u.id),
				),
			);

		// Verify no duplicates were created
		expect(usersAfterSecondImport.length).toBe(3); // Same as before
		expect(membersAfterSecondImport.length).toBe(3); // Same as before

		// Verify user details were updated (not duplicated)
		const [user1] = await db.select().from(table.user).where(eq(table.user.email, email1));
		expect(user1?.firstNames).toBe("Alice");
		expect(user1?.lastName).toBe("Smith");
		expect(user1?.homeMunicipality).toBe("Helsinki");
	});
});
