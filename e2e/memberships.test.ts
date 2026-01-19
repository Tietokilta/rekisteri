import { test, expect } from "./fixtures/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";

test.describe("Memberships Admin", () => {
	// Track test memberships for cleanup
	let testMembershipIds: string[] = [];

	// Use existing membership type IDs from seed data
	const membershipTypeId = "varsinainen-jasen";
	const alternateMembershipTypeId = "ulkojasen";

	test.afterEach(async ({ db }) => {
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

	test("opens edit sheet when clicking a membership", async ({ adminPage, db }) => {
		// Create a test membership with a unique date range to identify it
		const testMembershipId = crypto.randomUUID();

		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: null,
			startTime: new Date(2030, 7, 1), // Use a far future date to make it unique
			endTime: new Date(2031, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Click the test membership (date display shows end year: 31.7.2031)
		await adminPage
			.getByRole("button", { name: /Varsinainen jäsen.*2031/ })
			.first()
			.click();

		// Verify edit sheet opens
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Verify form fields are present
		await expect(adminPage.getByLabel("Tyyppi")).toBeVisible();
	});

	test("edit form is pre-populated with membership data", async ({ adminPage, db }) => {
		// Create a test membership with known values
		const testMembershipId = crypto.randomUUID();

		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId: alternateMembershipTypeId, // Use ulkojasen to distinguish
			stripePriceId: null,
			startTime: new Date(2031, 7, 1),
			endTime: new Date(2032, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Click our test membership (date display shows end year: 31.7.2032)
		await adminPage
			.getByRole("button", { name: /Ulkojäsen.*2032/ })
			.first()
			.click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Verify the type dropdown has ulkojasen selected
		await expect(adminPage.getByLabel("Tyyppi")).toHaveValue(alternateMembershipTypeId);
	});

	test("can update membership type", async ({ adminPage, db }) => {
		// Create a test membership to edit
		const testMembershipId = crypto.randomUUID();

		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: null,
			startTime: new Date(2032, 7, 1),
			endTime: new Date(2033, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership (date display shows end year: 31.7.2033)
		await adminPage
			.getByRole("button", { name: /Varsinainen jäsen.*2033/ })
			.first()
			.click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Change the type via the dropdown
		const typeSelect = adminPage.getByLabel("Tyyppi");
		await typeSelect.selectOption(alternateMembershipTypeId);

		// Submit the form
		await adminPage.getByRole("button", { name: "Tallenna" }).click();

		// Wait for the sheet to close
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the new type appears in the UI (date display shows end year: 31.7.2033)
		await expect(adminPage.getByRole("button", { name: /Ulkojäsen.*2033/ }).first()).toBeVisible();
	});

	test("can toggle student verification requirement", async ({ adminPage, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();

		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: null,
			startTime: new Date(2033, 7, 1),
			endTime: new Date(2034, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership (date display shows end year: 31.7.2034)
		await adminPage
			.getByRole("button", { name: /Varsinainen jäsen.*2034/ })
			.first()
			.click();

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

	test("can delete membership with no members", async ({ adminPage, db }) => {
		// Create a test membership with no members using a unique far-future year
		const testMembershipId = crypto.randomUUID();

		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: null,
			startTime: new Date(2040, 7, 1),
			endTime: new Date(2041, 6, 31),
			requiresStudentVerification: false,
		});
		// Don't add to cleanup array since we're testing delete

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership (date display shows end year: 31.7.2041)
		await adminPage
			.getByRole("button", { name: /Varsinainen jäsen.*2041/ })
			.first()
			.click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Click delete button
		await adminPage.getByRole("button", { name: "Poista" }).click();

		// Wait for the sheet to close
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the membership was deleted from the database
		const [deletedMembership] = await db
			.select()
			.from(table.membership)
			.where(eq(table.membership.id, testMembershipId));

		expect(deletedMembership).toBeUndefined();
	});

	test("cancel button closes sheet without saving", async ({ adminPage, db }) => {
		// Create a test membership
		const testMembershipId = crypto.randomUUID();

		await db.insert(table.membership).values({
			id: testMembershipId,
			membershipTypeId,
			stripePriceId: null,
			startTime: new Date(2035, 7, 1),
			endTime: new Date(2036, 6, 31),
			requiresStudentVerification: false,
		});
		testMembershipIds.push(testMembershipId);

		await adminPage.goto(route("/[locale=locale]/admin/memberships", { locale: "fi" }), {
			waitUntil: "networkidle",
		});

		// Find and click our test membership (date display shows end year: 31.7.2036)
		await adminPage
			.getByRole("button", { name: /Varsinainen jäsen.*2036/ })
			.first()
			.click();

		// Wait for the sheet to open
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).toBeVisible();

		// Change the type field
		const typeSelect = adminPage.getByLabel("Tyyppi");
		await typeSelect.selectOption(alternateMembershipTypeId);

		// Click cancel button
		await adminPage.getByRole("button", { name: "Peruuta" }).click();

		// Wait for the sheet to close
		await expect(adminPage.getByRole("heading", { name: "Muokkaa jäsenyyttä" })).not.toBeVisible();

		// Verify the original type is still shown (change was not saved)
		await expect(adminPage.getByRole("button", { name: /Varsinainen jäsen.*2036/ }).first()).toBeVisible();
	});
});
