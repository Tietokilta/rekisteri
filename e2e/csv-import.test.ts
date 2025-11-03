import { test, expect } from "./fixtures/auth";
import path from "node:path";
import fs from "node:fs";

test.describe("CSV Import", () => {
	// Test file upload with actual CSV file
	test("CSV import shows correct preview", async ({ adminPage }) => {
		await adminPage.goto("/admin/members/import", { waitUntil: "networkidle" });

		// Upload CSV file using setInputFiles (simpler approach)
		const csvPath = path.join(process.cwd(), "e2e/fixtures/sample-import.csv");
		const fileInput = adminPage.locator('input[type="file"]');

		// Check if file exists before uploading
		if (!fs.existsSync(csvPath)) {
			throw new Error(`Sample CSV not found at ${csvPath}`);
		}

		await fileInput.setInputFiles(csvPath);

		// Wait for file to be parsed
		await adminPage.waitForTimeout(1000);

		// Verify preview shows
		await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

		// Check that it shows correct number of users and records
		await expect(adminPage.getByText("Uniikkeja käyttäjiä (luotu tai päivitetty):")).toBeVisible();
		await expect(adminPage.getByText("Luotavia jäsentietueita:")).toBeVisible();

		// Verify table preview shows data
		await expect(adminPage.getByText("CSV-datan esikatselu")).toBeVisible();
		await expect(adminPage.getByRole("cell", { name: "Matti" }).first()).toBeVisible();
	});

	// Test validation with invalid columns using a temporary file
	test("CSV import validates incorrect column format", async ({ adminPage }) => {
		await adminPage.goto("/admin/members/import", { waitUntil: "networkidle" });

		// Create a temporary CSV file with wrong columns
		const tempPath = path.join(process.cwd(), "temp-invalid.csv");
		const invalidCsv = `wrong,columns,here
value1,value2,value3`;
		fs.writeFileSync(tempPath, invalidCsv);

		try {
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Wait for validation
			await adminPage.waitForTimeout(1000);

			// Verify error message shows
			await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible({ timeout: 5000 });
			await expect(adminPage.getByText(/CSV columns don't match/)).toBeVisible();
		} finally {
			// Clean up temp file
			fs.unlinkSync(tempPath);
		}
	});

	test("CSV import validates invalid email format", async ({ adminPage }) => {
		await adminPage.goto("/admin/members/import", { waitUntil: "networkidle" });

		// Create a temporary CSV file with invalid email
		const tempPath = path.join(process.cwd(), "temp-invalid-email.csv");
		const invalidEmailCsv = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,not-an-email,varsinainen jäsen,2025-08-01`;
		fs.writeFileSync(tempPath, invalidEmailCsv);

		try {
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Wait for validation
			await adminPage.waitForTimeout(1000);

			// Verify error message shows
			await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible({ timeout: 5000 });
			await expect(adminPage.getByText(/Invalid email format/)).toBeVisible();
		} finally {
			fs.unlinkSync(tempPath);
		}
	});

	test("CSV import validates invalid membership type", async ({ adminPage }) => {
		await adminPage.goto("/admin/members/import", { waitUntil: "networkidle" });

		// Create a temporary CSV file with non-existent membership type
		const tempPath = path.join(process.cwd(), "temp-invalid-type.csv");
		const invalidTypeCsv = `firstNames,lastName,homeMunicipality,email,membershipType,membershipStartDate
Test,User,Helsinki,test@example.com,nonexistent-type,2025-08-01`;
		fs.writeFileSync(tempPath, invalidTypeCsv);

		try {
			const fileInput = adminPage.locator('input[type="file"]');
			await fileInput.setInputFiles(tempPath);

			// Wait for validation
			await adminPage.waitForTimeout(1000);

			// Verify error message shows
			await expect(adminPage.getByText("Vahvistusvirheet:")).toBeVisible({ timeout: 5000 });
			await expect(adminPage.getByText(/Invalid membership types/)).toBeVisible();
		} finally {
			fs.unlinkSync(tempPath);
		}
	});

	test("CSV import shows existing memberships", async ({ adminPage }) => {
		await adminPage.goto("/admin/members/import", { waitUntil: "networkidle" });

		// Verify existing memberships section is visible
		await expect(adminPage.getByText("Olemassa olevat jäsenyydet tietokannassa:")).toBeVisible({ timeout: 10_000 });
		await expect(adminPage.getByText("CSV-rivien tulee vastata näitä täsmälleen")).toBeVisible();

		// Verify some membership types are listed
		await expect(adminPage.getByText("varsinainen jäsen").first()).toBeVisible();
		await expect(adminPage.getByText("ulkojäsen").first()).toBeVisible();
	});
});
