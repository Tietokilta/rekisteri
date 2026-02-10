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

    // Verify error message shows (heading only shows when there are no valid rows)
    await expect(adminPage.getByRole("heading", { name: "Vahvistusvirheet:" })).toBeVisible();
    await expect(adminPage.getByTestId("validation-error")).toBeVisible();
  });

  test("CSV import validates invalid email format", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Create a temporary CSV file with invalid email
    const tempPath = path.join(process.cwd(), `temp-invalid-email-${crypto.randomUUID()}.csv`);
    tempFiles.push(tempPath); // Track for cleanup
    const invalidEmailCsv = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Test,User,Helsinki,not-an-email,varsinainen-jasen,2025-08-01`;
    fs.writeFileSync(tempPath, invalidEmailCsv);

    const fileInput = adminPage.locator('input[type="file"]');
    await fileInput.setInputFiles(tempPath);

    // Verify error message shows (heading only shows when there are no valid rows)
    await expect(adminPage.getByRole("heading", { name: "Vahvistusvirheet:" })).toBeVisible();
    await expect(adminPage.getByTestId("validation-error")).toBeVisible();
  });

  test("CSV import validates invalid membership type ID", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Create a temporary CSV file with non-existent membership type
    const tempPath = path.join(process.cwd(), `temp-invalid-type-${crypto.randomUUID()}.csv`);
    tempFiles.push(tempPath); // Track for cleanup
    const invalidTypeCsv = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Test,User,Helsinki,test@example.com,nonexistent-type,2025-08-01`;
    fs.writeFileSync(tempPath, invalidTypeCsv);

    const fileInput = adminPage.locator('input[type="file"]');
    await fileInput.setInputFiles(tempPath);

    // Wait for file processing and verify error message shows
    // The invalid type ID appears in the unmatched memberships section as the type name
    await expect(adminPage.getByTestId("membership-type-name")).toHaveText("nonexistent-type", { timeout: 10_000 });
  });

  test("CSV import shows available membership types", async ({ adminPage }) => {
    await adminPage.goto(route("/[locale=locale]/admin/members/import", { locale: "fi" }), {
      waitUntil: "networkidle",
    });

    // Verify membership type IDs are listed in the instructions
    await expect(adminPage.getByText("varsinainen-jasen")).toBeVisible();
    await expect(adminPage.getByText("ulkojasen")).toBeVisible();
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

    // 2. Create CSV with the secondary email
    const tempPath = path.join(process.cwd(), `temp-csv-import-${crypto.randomUUID()}.csv`);
    tempFiles.push(tempPath); // Track for cleanup
    const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Test,User,Helsinki,${secondaryEmail},varsinainen-jasen,2025-08-01`;
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

    // 6. Verify the user was NOT created with secondary email as primary
    // (Don't check total user count - races with parallel tests)
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

    // 2. Create CSV with the unverified secondary email
    const tempPath = path.join(process.cwd(), `temp-csv-import-${crypto.randomUUID()}.csv`);
    tempFiles.push(tempPath); // Track for cleanup
    const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
New,Person,Espoo,${unverifiedEmail},varsinainen-jasen,2025-08-01`;
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

    // 6. Verify a NEW user WAS created with the unverified email as their PRIMARY email
    // (Don't check total user count - races with parallel tests)
    const [newUser] = await db.select().from(table.user).where(eq(table.user.email, unverifiedEmail));
    expect(newUser).toBeDefined();
    expect(newUser?.email).toBe(unverifiedEmail);
    expect(newUser?.firstNames).toBe("New");
    expect(newUser?.lastName).toBe("Person");

    // 7. Track the newly created user for cleanup
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
    let csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate\n`;

    // Generate 2000 unique rows
    const generatedEmails: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      const email = `batch-test-${i}-${crypto.randomUUID()}@example.com`;
      generatedEmails.push(email);
      csvContent += `FirstName${i},LastName${i},Helsinki,${email},varsinainen-jasen,2025-08-01\n`;
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

  test.describe("Legacy Membership Creation", () => {
    // Track memberships created for cleanup
    let testMembershipIds: string[] = [];

    // Cache-busting import page URL to ensure fresh server data after DB cleanup.
    // The adminPage browser context can cache SvelteKit's server responses.
    const importPageUrl = () => `${route("/[locale=locale]/admin/members/import", { locale: "fi" })}?_=${Date.now()}`;

    test.beforeEach(async () => {
      // Clean up any non-seed memberships from previous failed test runs.
      // Seed data starts at 2022, so anything before that is test-created.
      const allMemberships = await db.select().from(table.membership);
      const toDelete = allMemberships.filter((m) => m.startTime < new Date("2022-01-01"));

      for (const m of toDelete) {
        await db.delete(table.member).where(eq(table.member.membershipId, m.id));
        await db.delete(table.membership).where(eq(table.membership.id, m.id));
      }
    });

    test.afterEach(async () => {
      // Clean up created memberships
      for (const membershipId of testMembershipIds) {
        // First delete any member records that reference this membership
        await db.delete(table.member).where(eq(table.member.membershipId, membershipId));
        // Then delete the membership
        await db.delete(table.membership).where(eq(table.membership.id, membershipId));
      }
      testMembershipIds = [];
    });

    test("Quick Create creates legacy membership for unmatched CSV row", async ({ adminPage }) => {
      // Create a CSV with a membership that doesn't exist (old start date)
      const tempPath = path.join(process.cwd(), `temp-legacy-${crypto.randomUUID()}.csv`);
      tempFiles.push(tempPath);
      const email = getTestEmail("legacy");
      const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Test,User,Helsinki,${email},varsinainen-jasen,2019-08-01`;
      fs.writeFileSync(tempPath, csvContent);

      await adminPage.goto(importPageUrl(), {
        waitUntil: "networkidle",
      });

      const fileInput = adminPage.locator('input[type="file"]');
      await fileInput.setInputFiles(tempPath);

      // Wait for analysis to complete - should show unmatched
      await expect(adminPage.getByText("Ratkaisua tarvitaan")).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByRole("heading", { name: "Puuttuvat jäsenyydet" })).toBeVisible();

      // Verify the unmatched membership shows the type and start date
      await expect(adminPage.getByTestId("membership-type-name").first()).toBeVisible();
      await expect(adminPage.getByTestId("membership-start-date")).toHaveText("2019-08-01");

      // Click Quick Create button
      const quickCreateButton = adminPage.getByRole("button", { name: "Pikaluo" });
      await quickCreateButton.click();

      // Wait for creation to complete - should show "Created!" badge
      await expect(adminPage.getByText("Luotu!")).toBeVisible({ timeout: 10_000 });

      // Verify the row status changed to OK in the preview table
      await expect(adminPage.getByRole("cell", { name: "OK" }).first()).toBeVisible();

      // Verify import preview now shows the row is ready
      await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible();

      // Verify the membership was created in the database as legacy (no Stripe price)
      const [createdMembership] = await db
        .select()
        .from(table.membership)
        .where(eq(table.membership.startTime, new Date("2019-08-01")));

      expect(createdMembership).toBeDefined();
      expect(createdMembership?.stripePriceId).toBeNull();
      expect(createdMembership?.membershipTypeId).toBe("varsinainen-jasen");

      // Track for cleanup
      if (createdMembership) {
        testMembershipIds.push(createdMembership.id);
      }

      // Now execute the import
      const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
      await importButton.click();

      await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

      // Track created user for cleanup
      const [createdUser] = await db.select().from(table.user).where(eq(table.user.email, email));
      if (createdUser) {
        testUserIds.push(createdUser.id);
      }
    });

    test("Create All Missing Memberships batch creates multiple legacy memberships", async ({ adminPage }) => {
      // Create a CSV with multiple memberships that don't exist
      // Use very old unique dates to avoid conflicts with other tests
      const tempPath = path.join(process.cwd(), `temp-batch-legacy-${crypto.randomUUID()}.csv`);
      tempFiles.push(tempPath);
      const email1 = getTestEmail("batch1");
      const email2 = getTestEmail("batch2");
      const email3 = getTestEmail("batch3");
      // Use years that definitely don't exist in seed data and won't conflict
      const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Alice,Smith,Helsinki,${email1},varsinainen-jasen,1998-08-01
Bob,Jones,Tampere,${email2},ulkojasen,1998-08-01
Charlie,Brown,Espoo,${email3},varsinainen-jasen,1997-08-01`;
      fs.writeFileSync(tempPath, csvContent);

      await adminPage.goto(importPageUrl(), {
        waitUntil: "networkidle",
      });

      const fileInput = adminPage.locator('input[type="file"]');
      await fileInput.setInputFiles(tempPath);

      // Wait for analysis - should show unmatched
      await expect(adminPage.getByText("Ratkaisua tarvitaan")).toBeVisible({ timeout: 10_000 });
      await expect(adminPage.getByRole("heading", { name: "Puuttuvat jäsenyydet" })).toBeVisible();

      // Should show "Create All Missing Memberships" button since we have multiple
      const createAllButton = adminPage.getByRole("button", { name: "Luo kaikki puuttuvat jäsenyydet" });
      await expect(createAllButton).toBeVisible();

      // Click it
      await createAllButton.click();

      // Wait for all to be created
      await expect(adminPage.getByText("Luotu!").first()).toBeVisible({ timeout: 15_000 });

      // Should have multiple "Luotu!" badges (at least 2, since 2 unique type+date combos)
      // varsinainen-jasen 2018, ulkojasen 2018, varsinainen-jasen 2017 = 3 unique
      const createdBadges = adminPage.getByText("Luotu!");
      await expect(createdBadges).toHaveCount(3);

      // Verify memberships were created in database
      const createdMemberships = await db
        .select()
        .from(table.membership)
        .where(inArray(table.membership.startTime, [new Date("1997-08-01"), new Date("1998-08-01")]));

      // Should have 3 new memberships
      expect(createdMemberships.length).toBe(3);

      // All should be legacy (no Stripe price)
      for (const m of createdMemberships) {
        expect(m.stripePriceId).toBeNull();
        testMembershipIds.push(m.id);
      }

      // Now import should work
      const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
      await importButton.click();

      await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

      // Track created users for cleanup
      const createdUsers = await db
        .select()
        .from(table.user)
        .where(inArray(table.user.email, [email1, email2, email3]));
      for (const user of createdUsers) {
        testUserIds.push(user.id);
      }
    });

    test("Link to existing membership resolves unmatched row", async ({ adminPage }) => {
      // Create a CSV with a membership that doesn't exist exactly but can be linked
      const tempPath = path.join(process.cwd(), `temp-link-${crypto.randomUUID()}.csv`);
      tempFiles.push(tempPath);
      const email = getTestEmail("link");
      // Use a date that doesn't exist but can be linked to an existing one
      const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Test,User,Helsinki,${email},varsinainen-jasen,2016-08-01`;
      fs.writeFileSync(tempPath, csvContent);

      await adminPage.goto(importPageUrl(), {
        waitUntil: "networkidle",
      });

      const fileInput = adminPage.locator('input[type="file"]');
      await fileInput.setInputFiles(tempPath);

      // Wait for analysis - should show unmatched
      await expect(adminPage.getByText("Ratkaisua tarvitaan")).toBeVisible({ timeout: 10_000 });

      // Find the dropdown to link to existing membership
      const selectDropdown = adminPage.locator("select").first();
      await expect(selectDropdown).toBeVisible();

      // Get all options and select one (not the first "Valitse jäsenyys..." option)
      // Select an existing membership (2022 varsinainen jäsen)
      await selectDropdown.selectOption({ index: 1 }); // Select second option (first real membership)

      // Should now show "Yhdistetty" (Linked) badge
      await expect(adminPage.getByTestId("badge-linked")).toBeVisible();

      // The row should now be OK
      await expect(adminPage.getByRole("cell", { name: "OK" }).first()).toBeVisible();

      // Import should now work
      const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
      await expect(importButton).toBeEnabled();

      // Execute import
      await importButton.click();

      await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 10_000 });

      // Track created user for cleanup
      const [createdUser] = await db.select().from(table.user).where(eq(table.user.email, email));
      if (createdUser) {
        testUserIds.push(createdUser.id);
      }
    });

    test("imports members with memberships spanning 2018-2026 including outside seeded data", async ({ adminPage }) => {
      // Generate unique emails for this test run to ensure parallel safety
      const testId = crypto.randomUUID().slice(0, 8);
      const testEmails = [
        `testi-${testId}@example.com`,
        `vanha-${testId}@example.com`,
        `alumni-${testId}@example.com`,
        `kannattaja-${testId}@example.com`,
        `uusi-${testId}@example.com`,
        `pitka-${testId}@example.com`,
      ];

      // Create a dynamic CSV with memberships spanning 2018-2026:
      // - Memberships that exist (2022-2025 varsinainen/ulkojasen)
      // - Memberships that DON'T exist (2018-2021 varsinainen, 2019-2021 ulkojasen)
      // - alumnijasen for 2023-2025 (only 2026 exists in seed)
      // - kannatusjasen for 2021-2023 (only 2024-2025 exists in seed)
      const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Testi,Henkilö,Helsinki,${testEmails[0]},varsinainen-jasen,2020-08-01
Testi,Henkilö,Helsinki,${testEmails[0]},varsinainen-jasen,2021-08-01
Testi,Henkilö,Helsinki,${testEmails[0]},varsinainen-jasen,2023-08-01
Testi,Henkilö,Helsinki,${testEmails[0]},varsinainen-jasen,2024-08-01
Testi,Henkilö,Helsinki,${testEmails[0]},varsinainen-jasen,2025-08-01
Vanha,Jäsen,Espoo,${testEmails[1]},ulkojasen,2019-08-01
Vanha,Jäsen,Espoo,${testEmails[1]},ulkojasen,2020-08-01
Vanha,Jäsen,Espoo,${testEmails[1]},ulkojasen,2021-08-01
Vanha,Jäsen,Espoo,${testEmails[1]},varsinainen-jasen,2022-08-01
Vanha,Jäsen,Espoo,${testEmails[1]},varsinainen-jasen,2023-08-01
Alumni,Testaaja,Tampere,${testEmails[2]},alumnijasen,2023-08-01
Alumni,Testaaja,Tampere,${testEmails[2]},alumnijasen,2024-08-01
Alumni,Testaaja,Tampere,${testEmails[2]},alumnijasen,2025-08-01
Kannattaja,Tuki,Turku,${testEmails[3]},kannatusjasen,2021-08-01
Kannattaja,Tuki,Turku,${testEmails[3]},kannatusjasen,2022-08-01
Kannattaja,Tuki,Turku,${testEmails[3]},kannatusjasen,2023-08-01
Kannattaja,Tuki,Turku,${testEmails[3]},kannatusjasen,2024-08-01
Kannattaja,Tuki,Turku,${testEmails[3]},kannatusjasen,2025-08-01
Uusi,Käyttäjä,Vantaa,${testEmails[4]},varsinainen-jasen,2025-08-01
Uusi,Käyttäjä,Vantaa,${testEmails[4]},varsinainen-jasen,2026-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2018-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2019-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2020-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2021-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2022-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2023-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2024-08-01
Pitkä,Historia,Oulu,${testEmails[5]},varsinainen-jasen,2025-08-01`;

      const csvPath = path.join(process.cwd(), `temp-legacy-full-${testId}.csv`);
      tempFiles.push(csvPath); // Track for cleanup
      fs.writeFileSync(csvPath, csvContent);

      await adminPage.goto(importPageUrl(), {
        waitUntil: "networkidle",
      });

      const fileInput = adminPage.locator('input[type="file"]');
      await fileInput.setInputFiles(csvPath);

      // Wait for analysis - should show some unmatched
      await expect(adminPage.getByText("Tuonnin esikatselu")).toBeVisible({ timeout: 10_000 });

      // Should have unmatched memberships needing resolution
      // The CSV has memberships from 2018-2021 that don't exist
      const needsResolution = adminPage.getByText("Ratkaisua tarvitaan");
      if (await needsResolution.isVisible()) {
        await expect(adminPage.getByRole("heading", { name: "Puuttuvat jäsenyydet" })).toBeVisible();

        // Create all missing memberships at once
        const createAllButton = adminPage.getByRole("button", { name: "Luo kaikki puuttuvat jäsenyydet" });
        await expect(createAllButton).toBeVisible();
        await createAllButton.click();

        // Wait for all to be created - should see multiple "Luotu!" badges
        await expect(adminPage.getByText("Luotu!").first()).toBeVisible({ timeout: 30_000 });
      }

      // After resolution, created memberships should show "Luotu!" (Created) status
      await expect(adminPage.getByTestId("badge-created").first()).toBeVisible();

      // Import should now be enabled
      const importButton = adminPage.getByRole("button", { name: /tuo.*jäsen|import.*member/i });
      await expect(importButton).toBeEnabled();

      // Execute import
      await importButton.click();

      // Wait for success
      await expect(adminPage.getByText(/tuonti onnistui|import successful/i)).toBeVisible({ timeout: 30_000 });

      // Verify users were created (using testEmails defined at start of test)
      const createdUsers = await db.select().from(table.user).where(inArray(table.user.email, testEmails));

      // All 6 users should be created
      expect(createdUsers.length).toBe(6);

      // Track for cleanup
      for (const user of createdUsers) {
        testUserIds.push(user.id);
      }

      // Verify member records were created
      const createdMembers = await db
        .select()
        .from(table.member)
        .where(
          inArray(
            table.member.userId,
            createdUsers.map((u) => u.id),
          ),
        );

      // The CSV has 28 rows, so 28 member records should be created
      expect(createdMembers.length).toBe(28);

      // Verify some newly created legacy memberships exist
      const legacyMemberships = await db
        .select()
        .from(table.membership)
        .where(
          inArray(table.membership.startTime, [
            new Date("2018-08-01"),
            new Date("2019-08-01"),
            new Date("2020-08-01"),
            new Date("2021-08-01"),
          ]),
        );

      // Should have created memberships for years that didn't exist
      expect(legacyMemberships.length).toBeGreaterThan(0);

      // All legacy memberships should have no Stripe price
      for (const m of legacyMemberships) {
        expect(m.stripePriceId).toBeNull();
        testMembershipIds.push(m.id);
      }
    });

    test("Inferred end date uses academic year convention (Aug 1 -> Jul 31)", async ({ adminPage }) => {
      // Create a CSV with Aug 1 start date
      const tempPath = path.join(process.cwd(), `temp-infer-${crypto.randomUUID()}.csv`);
      tempFiles.push(tempPath);
      const email = getTestEmail("infer");
      const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Test,User,Helsinki,${email},varsinainen-jasen,2015-08-01`;
      fs.writeFileSync(tempPath, csvContent);

      await adminPage.goto(importPageUrl(), {
        waitUntil: "networkidle",
      });

      const fileInput = adminPage.locator('input[type="file"]');
      await fileInput.setInputFiles(tempPath);

      // Wait for analysis
      await expect(adminPage.getByRole("heading", { name: "Puuttuvat jäsenyydet" })).toBeVisible({ timeout: 10_000 });

      // Quick create the membership
      const quickCreateButton = adminPage.getByRole("button", { name: "Pikaluo" });
      await quickCreateButton.click();

      await expect(adminPage.getByText("Luotu!")).toBeVisible({ timeout: 10_000 });

      // Verify the membership was created with correct end date (Jul 31 next year)
      const [createdMembership] = await db
        .select()
        .from(table.membership)
        .where(eq(table.membership.startTime, new Date("2015-08-01")));

      expect(createdMembership).toBeDefined();
      expect(createdMembership?.endTime.toISOString().split("T")[0]).toBe("2016-07-31");

      // Track for cleanup
      if (createdMembership) {
        testMembershipIds.push(createdMembership.id);
      }
    });
  });

  test("CSV import is idempotent (running twice doesn't duplicate)", async ({ adminPage }) => {
    // Create a CSV with a few rows
    const tempPath = path.join(process.cwd(), `temp-idempotent-${crypto.randomUUID()}.csv`);
    tempFiles.push(tempPath); // Track for cleanup

    const email1 = getTestEmail("idempotent1");
    const email2 = getTestEmail("idempotent2");
    const email3 = getTestEmail("idempotent3");

    const csvContent = `firstNames,lastName,homeMunicipality,email,membershipTypeId,membershipStartDate
Alice,Smith,Helsinki,${email1},varsinainen-jasen,2025-08-01
Bob,Jones,Tampere,${email2},varsinainen-jasen,2025-08-01
Charlie,Brown,Espoo,${email3},varsinainen-jasen,2025-08-01`;

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
