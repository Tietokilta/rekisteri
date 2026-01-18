import { test, expect } from "./fixtures/auth";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Memberships Admin", () => {
	let client: ReturnType<typeof postgres>;
	let db: ReturnType<typeof drizzle>;

	// Track test memberships for cleanup
	let testMembershipIds: string[] = [];

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
		// Clean up test memberships
		for (const id of testMembershipIds) {
			await db.delete(table.membership).where(eq(table.membership.id, id));
		}
		testMembershipIds = [];
	});

	test("displays memberships page with existing data", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Verify page title is visible
		await expect(adminPage.getByRole("heading", { name: "Hallinnoi jäsenyyksiä" })).toBeVisible();

		// Verify create button exists
		await expect(adminPage.getByRole("button", { name: "Luo uusi jäsenyys" })).toBeVisible();

		// Verify memberships are grouped by year (there should be at least one year heading)
		await expect(adminPage.getByRole("heading", { level: 2 }).first()).toBeVisible();
	});

	test("opens create membership sheet", async ({ adminPage }) => {
		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Click create button
		await adminPage.getByRole("button", { name: "Luo uusi jäsenyys" }).click();

		// Verify sheet opens with form fields
		await expect(adminPage.getByLabel("Tyyppi")).toBeVisible();
		await expect(adminPage.getByLabel("Stripe hintakoodi")).toBeVisible();
		await expect(adminPage.getByLabel("Alkamisaika")).toBeVisible();
		await expect(adminPage.getByLabel("Päättymisaika")).toBeVisible();
	});

	test("opens edit sheet when clicking a membership", async ({ adminPage }) => {
		// Create a test membership to click
		const testMembershipId = crypto.randomUUID();
		const testType = `test-click-${crypto.randomUUID().slice(0, 8)}`;

		await db.insert(table.membership).values({
			id: testMembershipId,
			type: testType,
			stripePriceId: null,
			startTime: new Date(2025, 7, 1),
			endTime: new Date(2026, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Click the test membership by its type name
		await adminPage.getByRole("button", { name: new RegExp(testType) }).click();

		// Verify edit sheet opens
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Verify form fields are present
		await expect(adminPage.getByLabel("Tyyppi")).toBeVisible();
	});

	test("edit form is pre-populated with membership data", async ({ adminPage }) => {
		// Create a test membership with known values
		const testMembershipId = crypto.randomUUID();
		const testType = `test-prefill-${crypto.randomUUID().slice(0, 8)}`;

		await db.insert(table.membership).values({
			id: testMembershipId,
			type: testType,
			stripePriceId: null,
			startTime: new Date(2025, 7, 1),
			endTime: new Date(2026, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Click our test membership
		await adminPage.getByRole("button", { name: new RegExp(testType) }).click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Verify the type field is pre-populated with our test value
		await expect(adminPage.getByLabel("Tyyppi")).toHaveValue(testType);
	});

	test("can update membership type", async ({ adminPage }) => {
		// Create a test membership to edit
		const testMembershipId = crypto.randomUUID();
		const originalType = `test-type-${crypto.randomUUID().slice(0, 8)}`;
		const newType = `updated-type-${crypto.randomUUID().slice(0, 8)}`;

		await db.insert(table.membership).values({
			id: testMembershipId,
			type: originalType,
			stripePriceId: null,
			startTime: new Date(2025, 7, 1),
			endTime: new Date(2026, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership
		await adminPage.getByRole("button", { name: new RegExp(originalType) }).click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Clear and update the type field
		const typeInput = adminPage.getByLabel("Tyyppi");
		await typeInput.clear();
		await typeInput.fill(newType);

		// Submit the form
		await adminPage.getByRole("button", { name: "Tallenna" }).click();

		// Wait for the sheet to close and page to refresh
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the new type appears in the UI
		await expect(adminPage.getByText(newType)).toBeVisible();
	});

	test("can toggle student verification requirement", async ({ adminPage }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		const testType = `test-student-${crypto.randomUUID().slice(0, 8)}`;

		await db.insert(table.membership).values({
			id: testMembershipId,
			type: testType,
			stripePriceId: null,
			startTime: new Date(2025, 7, 1),
			endTime: new Date(2026, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership
		await adminPage.getByRole("button", { name: new RegExp(testType) }).click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Toggle the student verification checkbox
		const checkbox = adminPage.getByLabel("Edellyttää opiskelijastatusta");
		await checkbox.check();

		// Submit the form
		await adminPage.getByRole("button", { name: "Tallenna" }).click();

		// Wait for the sheet to close
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the update was saved (database check needed since UI indicator may be subtle)
		const [updatedMembership] = await db
			.select()
			.from(table.membership)
			.where(eq(table.membership.id, testMembershipId));

		expect(updatedMembership?.requiresStudentVerification).toBe(true);
	});

	test("can delete membership with no members", async ({ adminPage }) => {
		// Create a test membership with no members
		const testMembershipId = crypto.randomUUID();
		const testType = `test-delete-${crypto.randomUUID().slice(0, 8)}`;

		await db.insert(table.membership).values({
			id: testMembershipId,
			type: testType,
			stripePriceId: null,
			startTime: new Date(2025, 7, 1),
			endTime: new Date(2026, 6, 31),
			requiresStudentVerification: false,
		});
		// Don't add to cleanup array since we're testing delete

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership
		await adminPage.getByRole("button", { name: new RegExp(testType) }).click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Click delete button
		await adminPage.getByRole("button", { name: "Poista" }).click();

		// Wait for the sheet to close
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the membership no longer appears in the UI
		await expect(adminPage.getByText(testType)).not.toBeVisible();
	});

	test("cancel button closes sheet without saving", async ({ adminPage }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();
		const testType = `test-cancel-${crypto.randomUUID().slice(0, 8)}`;

		await db.insert(table.membership).values({
			id: testMembershipId,
			type: testType,
			stripePriceId: null,
			startTime: new Date(2025, 7, 1),
			endTime: new Date(2026, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership
		await adminPage.getByRole("button", { name: new RegExp(testType) }).click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Change the type field
		const typeInput = adminPage.getByLabel("Tyyppi");
		await typeInput.clear();
		await typeInput.fill("should-not-be-saved");

		// Click cancel button
		await adminPage.getByRole("button", { name: "Peruuta" }).click();

		// Wait for the sheet to close
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the original type is still visible (change was not saved)
		await expect(adminPage.getByText(testType)).toBeVisible();
	});
});
