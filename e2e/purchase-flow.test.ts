import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Membership Purchase Flow Tests
 */

test.describe("Membership Purchase Flow", () => {
	test("user can select membership and initiate purchase", async ({ authenticatedPage, testData }) => {
		const user = await testData.createUser({
			email: "purchase-test@example.com",
			isAdmin: false,
		});

		const initialMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user.id),
		});
		const initialCount = initialMembers.length;

		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });
		await expect(authenticatedPage.getByText(/osta jäsenyys|buy membership/i)).toBeVisible();

		const availableMemberships = await db.query.membership.findMany();
		expect(availableMemberships.length).toBeGreaterThan(0);

		const firstMembership = availableMemberships[0];
		if (!firstMembership) throw new Error("No membership available for test");

		const membershipLabel = authenticatedPage.getByTestId(`membership-option-${firstMembership.id}`);
		await expect(membershipLabel).toBeVisible();

		const labelText = await membershipLabel.textContent();
		expect(labelText).toMatch(/\d+([.,]\d{2})?\s*€/);
		expect(labelText).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/);

		const membershipRadio = authenticatedPage.getByTestId(`membership-radio-${firstMembership.id}`);
		await membershipRadio.click();
		await expect(membershipRadio).toBeChecked();

		const submitButton = authenticatedPage.getByTestId("purchase-submit-button");
		await expect(submitButton).toBeEnabled();
		await submitButton.click();

		await expect(authenticatedPage).toHaveURL(/checkout\.stripe\.com/, { timeout: 10_000 });

		const newMembers = await db.query.member.findMany({
			where: eq(table.member.userId, user.id),
			orderBy: desc(table.member.createdAt),
		});

		expect(newMembers.length).toBe(initialCount + 1);

		const newMember = newMembers[0];
		expect(newMember?.status).toBe("awaiting_payment");
		expect(newMember?.stripeSessionId).toMatch(/^cs_/);
	});

	test("student verification is enforced for student memberships", async ({ authenticatedPage, testData }) => {
		await testData.createUser({
			email: "student-test@example.com",
			isAdmin: false,
		});

		await authenticatedPage.goto("/new", { waitUntil: "networkidle" });

		const studentMembership = await db.query.membership.findFirst({
			where: eq(table.membership.requiresStudentVerification, true),
		});

		if (!studentMembership) {
			console.log("⚠️  Skipping student verification test - no student membership configured");
			return;
		}

		const studentRadio = authenticatedPage.getByTestId(`membership-radio-${studentMembership.id}`);
		await studentRadio.click();
		await expect(studentRadio).toBeChecked();

		const studentCheckbox = authenticatedPage.getByTestId("student-verification-checkbox");
		await expect(studentCheckbox).toBeVisible();

		if (await studentCheckbox.isChecked()) {
			await studentCheckbox.click();
		}

		const submitButton = authenticatedPage.getByTestId("purchase-submit-button");
		await expect(submitButton).toBeDisabled();

		await studentCheckbox.click();
		await expect(studentCheckbox).toBeChecked();
		await expect(submitButton).toBeEnabled();
	});

	test("handles payment success and cancel redirects", async ({ authenticatedPage, testData }) => {
		await testData.createUser({
			email: "redirect-test@example.com",
			isAdmin: false,
		});

		await authenticatedPage.goto("/?stripeStatus=success", { waitUntil: "networkidle" });
		await expect(authenticatedPage).toHaveURL(/stripeStatus=success/);
		await expect(authenticatedPage.locator('input[type="email"]').first()).toBeVisible();

		await authenticatedPage.goto("/?stripeStatus=cancel", { waitUntil: "networkidle" });
		await expect(authenticatedPage).toHaveURL(/stripeStatus=cancel/);
		await expect(authenticatedPage.locator('input[type="email"]').first()).toBeVisible();
	});

	test("unauthenticated users cannot access purchase page", async ({ page }) => {
		await page.goto("/new");
		await expect(page).toHaveURL(/sign-in|kirjaudu/);
	});
});
