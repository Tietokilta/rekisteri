import { test, expect } from "./fixtures/auth";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * User Profile Tests
 */

test.describe("User Profile", () => {
	test("user can view, edit, and save profile information", async ({ page, testData }) => {
		// Create dedicated test user to avoid test pollution
		const user = await testData.createUser({
			email: `profile-edit-${Date.now()}@example.com`,
			firstNames: "Original",
			lastName: "Name",
			homeMunicipality: "Original City",
			isAllowedEmails: false,
			isAdmin: false,
		});

		const session = await testData.createSession(user.id);

		await page.context().addCookies([
			{
				name: "session",
				value: session.id,
				domain: "localhost",
				path: "/",
				httpOnly: true,
				sameSite: "Lax",
			},
		]);

		await page.goto("/", { waitUntil: "networkidle" });

		const emailInput = page.locator('input[type="email"]').first();
		await expect(emailInput).toBeVisible();
		await expect(emailInput).toHaveValue(user.email);
		await expect(emailInput).toHaveAttribute("readonly");

		const uniqueSuffix = Date.now();
		const newFirstNames = `TestFirst${uniqueSuffix}`;
		const newLastName = `TestLast${uniqueSuffix}`;
		const newMunicipality = `TestCity${uniqueSuffix}`;

		await page.locator('input[name="firstNames"]').fill(newFirstNames);
		await page.locator('input[name="lastName"]').fill(newLastName);
		await page.locator('input[name="homeMunicipality"]').fill(newMunicipality);

		const emailSwitch = page.getByTestId("email-consent-toggle");
		const initialEmailConsent = await emailSwitch.getAttribute("data-state");
		await emailSwitch.click();

		const saveButton = page.getByTestId("save-profile-button");
		await saveButton.click();

		await page.waitForLoadState("networkidle");

		const updatedUser = await db.query.user.findFirst({
			where: eq(table.user.id, user.id),
		});

		expect(updatedUser?.firstNames).toBe(newFirstNames);
		expect(updatedUser?.lastName).toBe(newLastName);
		expect(updatedUser?.homeMunicipality).toBe(newMunicipality);
		expect(updatedUser?.isAllowedEmails).toBe(initialEmailConsent !== "checked");

		await page.reload({ waitUntil: "networkidle" });
		await expect(page.locator('input[name="firstNames"]')).toHaveValue(newFirstNames);
		await expect(page.locator('input[name="lastName"]')).toHaveValue(newLastName);
		await expect(page.locator('input[name="homeMunicipality"]')).toHaveValue(newMunicipality);
	});
});
