import { test, expect } from "./fixtures/auth";
import path from "node:path";
import fs from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq, like } from "drizzle-orm";
import { createVerifiedSecondaryEmail, createUnverifiedSecondaryEmail } from "./helpers/secondary-email";

test.describe("CSV Import", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

	const getTestEmail = (prefix: string, workerIndex: number) => `${prefix}-w${workerIndex}-${Date.now()}@example.com`;

	test.beforeAll(async () => {
		const dbUrl = process.env.DATABASE_URL_TEST;
		if (!dbUrl) throw new Error("DATABASE_URL_TEST not set");
		client = postgres(dbUrl);
		db = drizzle(client, { schema: table, casing: "snake_case" });
	});

	test.afterAll(async () => {
		await client.end();
	});

	// eslint-disable-next-line no-empty-pattern -- required for playwright fixture
	test.beforeEach(async ({}, testInfo) => {
		// Clean up worker-specific emails for parallel test isolation
		const workerPattern = `%-w${testInfo.workerIndex}-%`;
		await db.delete(table.emailOTP).where(like(table.emailOTP.email, workerPattern));
		await db.delete(table.secondaryEmail).where(like(table.secondaryEmail.email, workerPattern));

		// Clean up test users created during import tests
		const [testUser] = await db.select().from(table.user).where(like(table.user.email, workerPattern));
		if (testUser) {
			await db.delete(table.member).where(eq(table.member.userId, testUser.id));
			await db.delete(table.user).where(eq(table.user.id, testUser.id));
		}
	});

	// Test file upload with actual CSV file
	test("CSV import shows correct preview", async ({ adminPage }) => {
		await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });

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
		await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });

		// Create a temporary CSV file with wrong columns
		const tempPath = path.join(process.cwd(), "temp-invalid.csv");
		const invalidCsv = `wrong,columns,here
value1,value2,value3`;
		fs.writeFileSync(tempPath, invalidCsv);

		try {
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Verify error message shows
			await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible();
			await expect(adminPage.getByText(/CSV columns don't match/)).toBeVisible();
		} finally {
			// Clean up temp file
			fs.unlinkSync(tempPath);
		}
	});

	test("CSV import validates invalid email format", async ({ adminPage }) => {
		await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });

		// Create a temporary CSV file with invalid email
		const tempPath = path.join(process.cwd(), "temp-invalid-email.csv");
		const invalidEmailCsv = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,not-an-email,varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, invalidEmailCsv);

		try {
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Verify error message shows
			await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible();
			await expect(adminPage.getByText(/Invalid email/)).toBeVisible();
		} finally {
			fs.unlinkSync(tempPath);
		}
	});

	test("CSV import validates invalid membership type", async ({ adminPage }) => {
		await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });

		// Create a temporary CSV file with non-existent membership type
		const tempPath = path.join(process.cwd(), "temp-invalid-type.csv");
		const invalidTypeCsv = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,test@example.com,nonexistent-type,2025-08-01`;
		fs.writeFileSync(tempPath, invalidTypeCsv);

		try {
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Verify error message shows
			await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible();
			await expect(adminPage.getByText(/Invalid membership types/)).toBeVisible();
		} finally {
			fs.unlinkSync(tempPath);
		}
	});

	test("CSV import shows existing memberships", async ({ adminPage }) => {
		await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });

		// Verify existing memberships section is visible
		await expect(adminPage.getByText("Olemassa olevat jäsenyydet tietokannassa:")).toBeVisible();
		await expect(adminPage.getByText("CSV-rivien tulee vastata näitä täsmälleen")).toBeVisible();

		// Verify some membership types are listed
		await expect(adminPage.getByText("varsinainen jäsen").first()).toBeVisible();
		await expect(adminPage.getByText("ulkojäsen").first()).toBeVisible();
	});

	test("should attach membership to existing user when CSV email is a verified secondary email", async ({
		adminPage,
		adminUser,
	}, testInfo) => {
		// 1. Set up: Admin user has a verified secondary email
		const secondaryEmail = getTestEmail("secondary", testInfo.workerIndex);

		// Create verified secondary email for admin user
		await createVerifiedSecondaryEmail(db, adminUser.id, secondaryEmail);

		// 2. Count users before import
		const usersBeforeImport = await db.select().from(table.user);
		const initialUserCount = usersBeforeImport.length;

		// 3. Create CSV with the secondary email
		const tempPath = path.join(process.cwd(), `temp-secondary-email-import-w${testInfo.workerIndex}.csv`);
		const csvContent = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,${secondaryEmail},varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, csvContent);

		try {
			// 4. Navigate to import page and upload CSV
			await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Wait for file to be parsed
			await adminPage.waitForTimeout(1000);

			// Verify preview shows
			await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

			// 5. Execute the import
			const importButton = adminPage.getByRole("button", { name: /tuo jäsenet|import members/i });
			await importButton.click();

			// Wait for success message
			await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

			// 6. Verify NO duplicate user was created
			const usersAfterImport = await db.select().from(table.user);
			expect(usersAfterImport.length).toBe(initialUserCount);

			// 7. Verify the user was NOT created with secondary email as primary
			const duplicateUser = await db.select().from(table.user).where(eq(table.user.email, secondaryEmail));
			expect(duplicateUser.length).toBe(0);

			// 8. Verify membership was attached to the EXISTING admin user
			const adminMembers = await db.select().from(table.member).where(eq(table.member.userId, adminUser.id));

			// Admin user should now have at least one member record
			expect(adminMembers.length).toBeGreaterThan(0);

			// 9. Verify the admin user's details were updated from the CSV
			const [updatedUser] = await db.select().from(table.user).where(eq(table.user.id, adminUser.id));
			expect(updatedUser?.firstNames).toBe("Test");
			expect(updatedUser?.lastName).toBe("User");
			expect(updatedUser?.homeMunicipality).toBe("Helsinki");
		} finally {
			// Clean up temp file
			fs.unlinkSync(tempPath);
		}
	});

	test("should NOT match unverified secondary emails during CSV import", async ({ adminPage, adminUser }, testInfo) => {
		// 1. Set up: Admin user has an UNVERIFIED secondary email
		const unverifiedEmail = getTestEmail("unverified", testInfo.workerIndex);

		// Create unverified secondary email for admin user
		await createUnverifiedSecondaryEmail(db, adminUser.id, unverifiedEmail);

		// 2. Count users before import
		const usersBeforeImport = await db.select().from(table.user);
		const initialUserCount = usersBeforeImport.length;

		// 3. Create CSV with the unverified secondary email
		const tempPath = path.join(process.cwd(), `temp-unverified-import-w${testInfo.workerIndex}.csv`);
		const csvContent = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
New,Person,Espoo,${unverifiedEmail},varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, csvContent);

		try {
			// 4. Navigate to import page and upload CSV
			await adminPage.goto("/fi/admin/members/import", { waitUntil: "networkidle" });
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Wait for file to be parsed
			await adminPage.waitForTimeout(1000);

			// Verify preview shows
			await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

			// 5. Execute the import
			const importButton = adminPage.getByRole("button", { name: /tuo jäsenet|import members/i });
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

			// 8. Cleanup: Delete the newly created user and their members
			if (newUser) {
				await db.delete(table.member).where(eq(table.member.userId, newUser.id));
				await db.delete(table.user).where(eq(table.user.id, newUser.id));
			}
		} finally {
			// Clean up temp file
			fs.unlinkSync(tempPath);
		}
	});
});
