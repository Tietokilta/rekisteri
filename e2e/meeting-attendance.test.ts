import { test, expect } from "./fixtures/auth";
import {
  AttendanceTestHelper,
  createTestMeeting,
  createTestUser,
  deleteTestMeeting,
  deleteTestUser,
} from "./fixtures/attendance";
import { db } from "../src/lib/server/db";
import * as table from "../src/lib/server/db/schema";

test.describe("Meeting Attendance System", () => {
  let testMeetingId: string;
  let testUserId1: string;
  let testUserId2: string;
  let attendanceHelper: AttendanceTestHelper;

  test.beforeEach(async ({ adminUser }) => {
    // Create test meeting and users for each test
    testMeetingId = await createTestMeeting("Test Weekly Meeting");

    const user1 = await createTestUser("user1@test.com", "Alice Test", false);
    const user2 = await createTestUser("user2@test.com", "Bob Test", false);
    testUserId1 = user1.id;
    testUserId2 = user2.id;

    // Create active memberships for test users
    await db.insert(table.member).values([
      {
        id: crypto.randomUUID(),
        userId: testUserId1,
        membershipId: "dummy-membership",
        status: "active",
      },
      {
        id: crypto.randomUUID(),
        userId: testUserId2,
        membershipId: "dummy-membership",
        status: "active",
      },
    ]);

    attendanceHelper = new AttendanceTestHelper(testMeetingId, adminUser.id);
  });

  test.afterEach(async () => {
    // Clean up test data
    await deleteTestMeeting(testMeetingId);
    await deleteTestUser(testUserId1);
    await deleteTestUser(testUserId2);
  });

  test("Admin can create and view a new meeting", async ({ adminPage }) => {
    await adminPage.goto("/en/admin/meetings");

    // Verify meetings list page loads
    await expect(adminPage.getByText("Meetings")).toBeVisible();

    // Check if our test meeting appears in the list
    await expect(adminPage.getByText("Test Weekly Meeting")).toBeVisible();
  });

  test("Admin can transition meeting states", async ({ adminPage }) => {
    await adminPage.goto(`/en/admin/meetings/${testMeetingId}`);

    // Meeting should start in 'upcoming' status
    await expect(adminPage.getByText("upcoming")).toBeVisible();

    // Start the meeting
    await adminPage.getByRole("button", { name: /start meeting/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify status changed to 'ongoing'
    await expect(adminPage.getByText("ongoing")).toBeVisible();

    // Start recess
    await adminPage.getByRole("button", { name: /start recess/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify status changed to 'recess'
    await expect(adminPage.getByText("recess")).toBeVisible();

    // End recess
    await adminPage.getByRole("button", { name: /end recess/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify back to 'ongoing'
    await expect(adminPage.getByText("ongoing")).toBeVisible();

    // Finish meeting
    await adminPage.getByRole("button", { name: /finish meeting/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify status changed to 'finished'
    await expect(adminPage.getByText("finished")).toBeVisible();
  });

  test("Admin can manually check in and check out attendees", async ({ adminPage }) => {
    // Start the meeting first
    await attendanceHelper.transitionMeeting("ongoing");

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Verify attendees page loads
    await expect(adminPage.getByText("Attendees")).toBeVisible();

    // Show available members
    await adminPage.getByRole("button", { name: /show available only/i }).click();

    // Find Alice in available list and check her in
    const aliceRow = adminPage.getByRole("row", { name: /Alice Test/i });
    await expect(aliceRow).toBeVisible();
    await aliceRow.getByRole("button", { name: /check in/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify statistics updated
    await expect(adminPage.getByText("Currently In")).toBeVisible();
    await expect(adminPage.getByText("1", { exact: true })).toBeVisible(); // Should show 1 person in

    // Switch back to all attendees view
    await adminPage.getByRole("button", { name: /show all/i }).click();

    // Find Alice and check her out
    const aliceRowAll = adminPage.getByRole("row", { name: /Alice Test/i });
    await aliceRowAll.getByRole("button", { name: /check out/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify she's marked as "Out"
    await expect(aliceRowAll.getByText("Out")).toBeVisible();
  });

  test("Attendee list shows correct status and counts", async ({ adminPage }) => {
    // Start meeting and simulate some attendance
    await attendanceHelper.transitionMeeting("ongoing");
    await attendanceHelper.checkIn(testUserId1);
    await attendanceHelper.checkIn(testUserId2);
    await attendanceHelper.checkOut(testUserId1);

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Verify stats show correctly
    await expect(adminPage.getByText("Currently In")).toBeVisible();
    await expect(adminPage.locator("text=1").first()).toBeVisible(); // 1 person currently in (Bob)

    await expect(adminPage.getByText("Total Attended")).toBeVisible();
    await expect(adminPage.locator("text=2").first()).toBeVisible(); // 2 people total attended

    // Verify Alice shows as "Out"
    const aliceRow = adminPage.getByRole("row", { name: /Alice Test/i });
    await expect(aliceRow.getByText("Out")).toBeVisible();

    // Verify Bob shows as "In"
    const bobRow = adminPage.getByRole("row", { name: /Bob Test/i });
    await expect(bobRow.getByText("In")).toBeVisible();
  });

  test("Search filters attendees correctly", async ({ adminPage }) => {
    // Add some attendance
    await attendanceHelper.transitionMeeting("ongoing");
    await attendanceHelper.checkIn(testUserId1);
    await attendanceHelper.checkIn(testUserId2);

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Type in search box
    const searchBox = adminPage.getByPlaceholder(/search by name or email/i);
    await searchBox.fill("Alice");

    // Verify only Alice shows
    await expect(adminPage.getByRole("row", { name: /Alice Test/i })).toBeVisible();
    await expect(adminPage.getByRole("row", { name: /Bob Test/i })).not.toBeVisible();

    // Clear search
    await searchBox.clear();
    await searchBox.fill("Bob");

    // Verify only Bob shows
    await expect(adminPage.getByRole("row", { name: /Bob Test/i })).toBeVisible();
    await expect(adminPage.getByRole("row", { name: /Alice Test/i })).not.toBeVisible();
  });

  test("CSV export downloads with correct data", async ({ adminPage }) => {
    // Simulate attendance with specific times
    await attendanceHelper.transitionMeeting("ongoing");

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    await attendanceHelper.checkIn(testUserId1, oneHourAgo);
    await attendanceHelper.checkOut(testUserId1, now);

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Click export button and wait for download
    const downloadPromise = adminPage.waitForEvent("download");
    await adminPage.getByRole("link", { name: /export csv/i }).click();
    const download = await downloadPromise;

    // Verify download filename
    expect(download.suggestedFilename()).toMatch(/attendance-.*\.csv/);

    // Read CSV content
    const content = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of content) {
      chunks.push(Buffer.from(chunk));
    }
    const csvContent = Buffer.concat(chunks).toString("utf8");

    // Verify CSV contains meeting name and user data
    expect(csvContent).toContain("Test Weekly Meeting");
    expect(csvContent).toContain("Alice Test");
    expect(csvContent).toContain("user1@test.com");
  });

  test("Share link provides public read-only access", async ({ adminPage }) => {
    // Simulate some attendance
    await attendanceHelper.transitionMeeting("ongoing");
    await attendanceHelper.checkIn(testUserId1);
    await attendanceHelper.checkIn(testUserId2);

    // Get the share URL from the meeting detail page
    await adminPage.goto(`/en/admin/meetings/${testMeetingId}`);
    const shareUrlInput = adminPage.getByRole("textbox", { name: /^$/ }).filter({ hasText: /\/share\// });
    const shareUrl = (await shareUrlInput.inputValue()) || "";
    expect(shareUrl).toContain("/share/");

    // Visit the share link in a new context (simulating unauthenticated user)
    const context = await adminPage.context().browser()?.newContext();
    if (!context) throw new Error("Could not create new context");

    const publicPage = await context.newPage();
    await publicPage.goto(shareUrl);

    // Verify public page shows meeting data
    await expect(publicPage.getByText("Test Weekly Meeting")).toBeVisible();
    await expect(publicPage.getByText("Currently In")).toBeVisible();
    await expect(publicPage.getByText("Alice Test")).toBeVisible();
    await expect(publicPage.getByText("Bob Test")).toBeVisible();

    // Verify no admin actions are available (read-only)
    await expect(publicPage.getByRole("button", { name: /check in/i })).not.toBeVisible();
    await expect(publicPage.getByRole("button", { name: /check out/i })).not.toBeVisible();

    await context.close();
  });

  test("Check-in count increments correctly for multiple visits", async ({ adminPage }) => {
    await attendanceHelper.transitionMeeting("ongoing");

    // Simulate user checking in and out multiple times
    await attendanceHelper.checkIn(testUserId1);
    await attendanceHelper.checkOut(testUserId1);
    await attendanceHelper.checkIn(testUserId1);
    await attendanceHelper.checkOut(testUserId1);
    await attendanceHelper.checkIn(testUserId1);

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Find Alice's row and verify check-in count is 3
    const aliceRow = adminPage.getByRole("row", { name: /Alice Test/i });
    await expect(aliceRow.getByRole("cell").filter({ hasText: "3" })).toBeVisible();

    // Verify she's currently checked in
    await expect(aliceRow.getByText("In")).toBeVisible();
  });

  test("Check out all functionality works during recess", async ({ adminPage }) => {
    await attendanceHelper.transitionMeeting("ongoing");

    // Check in some users
    await attendanceHelper.checkIn(testUserId1);
    await attendanceHelper.checkIn(testUserId2);

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}`);

    // Start recess
    await adminPage.getByRole("button", { name: /start recess/i }).click();
    await adminPage.waitForLoadState("networkidle");

    // Verify "Check Out All" button is present and shows correct count
    const checkOutAllButton = adminPage.getByRole("button", { name: /check out all/i });
    await expect(checkOutAllButton).toBeVisible();
    await expect(checkOutAllButton).toContainText("2 attendees");

    // Click check out all (will trigger confirmation dialog)
    adminPage.once("dialog", async (dialog) => dialog.accept());
    await checkOutAllButton.click();
    await adminPage.waitForLoadState("networkidle");

    // Verify attendee count dropped to 0
    await expect(adminPage.getByText("Current attendees")).toBeVisible();
    await expect(adminPage.locator("text=0").first()).toBeVisible();
  });

  test("Empty state displays when no attendees", async ({ adminPage }) => {
    await attendanceHelper.transitionMeeting("ongoing");

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Verify empty state message
    await expect(adminPage.getByText("No one has attended yet")).toBeVisible();
  });

  test("Available members list excludes those who already attended", async ({ adminPage }) => {
    await attendanceHelper.transitionMeeting("ongoing");

    // Alice checks in
    await attendanceHelper.checkIn(testUserId1);

    await adminPage.goto(`/en/admin/meetings/${testMeetingId}/attendees`);

    // Show available only
    await adminPage.getByRole("button", { name: /show available only/i }).click();

    // Alice should not be in available list (she already attended)
    await expect(adminPage.getByRole("row", { name: /Alice Test/i })).not.toBeVisible();

    // Bob should be in available list
    await expect(adminPage.getByRole("row", { name: /Bob Test/i })).toBeVisible();
  });

  test("Scanner only available when meeting is ongoing or in recess", async ({ adminPage }) => {
    await adminPage.goto(`/en/admin/meetings/${testMeetingId}`);

    // Scanner should be disabled when meeting is upcoming
    const scannerLink = adminPage
      .getByRole("button", { name: /open scanner/i })
      .or(adminPage.getByRole("link", { name: /open scanner/i }));
    await expect(scannerLink).toBeDisabled();

    // Start meeting
    await attendanceHelper.transitionMeeting("ongoing");
    await adminPage.reload();

    // Scanner should now be enabled
    await expect(scannerLink).toBeEnabled();
  });

  test("Share URL remains consistent across page reloads", async ({ adminPage }) => {
    await adminPage.goto(`/en/admin/meetings/${testMeetingId}`);

    // Get share URL
    const shareUrlInput = adminPage.getByRole("textbox").filter({ hasText: /\/share\// });
    const shareUrl1 = await shareUrlInput.inputValue();

    // Reload page
    await adminPage.reload();

    // Share URL should be the same
    const shareUrl2 = await shareUrlInput.inputValue();
    expect(shareUrl1).toBe(shareUrl2);
  });
});
