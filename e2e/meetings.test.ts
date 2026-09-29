import { test, expect } from "./fixtures/db";
import type { Page } from "@playwright/test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as table from "$lib/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { route } from "../src/lib/ROUTES";
import type { relations } from "../src/lib/server/db/relations";

/**
 * Meeting attendance E2E tests.
 *
 * Every test creates its own meeting (and, where needed, its own registry user)
 * directly in the database, so tests are isolated and safe to run in parallel.
 */

type Db = PostgresJsDatabase<typeof relations>;

const suffix = () => crypto.randomUUID().slice(0, 8);

async function createMeeting(db: Db, options: { started?: boolean } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.insert(table.meeting).values({
    id,
    title: `E2E kokous ${suffix()}`,
    scheduledStartsAt: new Date(now - 30 * 60_000),
    startsAt: options.started ? new Date(now - 20 * 60_000) : null,
  });
  return id;
}

async function createUser(db: Db) {
  const id = crypto.randomUUID();
  const lastName = `Tester${suffix()}`;
  await db.insert(table.user).values({
    id,
    email: `meeting-${id}@example.com`,
    firstNames: "Meeting",
    lastName,
    adminRole: "none",
  });
  return { id, lastName, displayName: `Meeting ${lastName}` };
}

/** Adds a guest attendee who entered ten minutes ago. */
async function createPresentGuest(db: Db, meetingId: string) {
  const attendeeId = crypto.randomUUID();
  const displayName = `Läsnä ${suffix()}`;
  await db.insert(table.meetingAttendee).values({ id: attendeeId, meetingId, displayName });
  await db.insert(table.meetingAttendanceEvent).values({
    id: crypto.randomUUID(),
    meetingId,
    attendeeId,
    direction: "in",
    source: "manual",
    effectiveAt: new Date(Date.now() - 10 * 60_000),
  });
  return { attendeeId, displayName };
}

async function deleteMeetings(db: Db, meetingIds: string[]) {
  if (meetingIds.length === 0) return;
  const eventIds = db
    .select({ id: table.meetingAttendanceEvent.id })
    .from(table.meetingAttendanceEvent)
    .where(inArray(table.meetingAttendanceEvent.meetingId, meetingIds));
  await db
    .delete(table.meetingAttendanceEventCorrection)
    .where(inArray(table.meetingAttendanceEventCorrection.eventId, eventIds));
  await db.delete(table.meetingAttendanceEvent).where(inArray(table.meetingAttendanceEvent.meetingId, meetingIds));
  await db.delete(table.meetingRecess).where(inArray(table.meetingRecess.meetingId, meetingIds));
  await db.delete(table.meetingAttendee).where(inArray(table.meetingAttendee.meetingId, meetingIds));
  await db.delete(table.meeting).where(inArray(table.meeting.id, meetingIds));
}

function meetingUrl(id: string) {
  return route("/[locale=locale]/admin/meetings/[id]", { locale: "fi", id });
}

function attendeeRow(page: Page, name: string) {
  return page.getByTestId("attendee-row").filter({ hasText: name });
}

function logRow(page: Page, text: string) {
  return page.getByTestId("log-row").filter({ hasText: text });
}

test.describe("Meeting attendance", () => {
  let meetingIds: string[] = [];
  let userIds: string[] = [];

  test.afterEach(async ({ db }) => {
    await deleteMeetings(db, meetingIds);
    if (userIds.length) await db.delete(table.user).where(inArray(table.user.id, userIds));
    meetingIds = [];
    userIds = [];
  });

  test("creates a meeting from the list and opens it", async ({ adminPage, db }) => {
    const title = `E2E luotu ${suffix()}`;
    await adminPage.goto(route("/[locale=locale]/admin/meetings", { locale: "fi" }));
    await expect(adminPage.getByTestId("admin-meetings-page")).toBeVisible();

    await adminPage.getByLabel("Kokouksen nimi").fill(title);
    await adminPage.getByLabel("Suunniteltu alkamisaika").fill("2026-11-02T18:00");
    await adminPage.getByRole("button", { name: "Luo kokous" }).click();

    await adminPage.waitForURL(/\/admin\/meetings\/[0-9a-f-]{36}$/);
    const id = adminPage.url().split("/").pop() ?? "";
    meetingIds.push(id);

    await expect(adminPage.getByRole("heading", { name: title })).toBeVisible();
    await expect(adminPage.getByTestId("meeting-status")).toContainText("Ei vielä alkanut");
    await expect(adminPage.getByTestId("meeting-status")).toContainText("2.11. klo 18.00");

    const [meeting] = await db.select().from(table.meeting).where(eq(table.meeting.id, id));
    expect(meeting?.title).toBe(title);
    expect(meeting?.scheduledStartsAt?.toISOString()).toBe("2026-11-02T16:00:00.000Z");
  });

  test("starts the meeting", async ({ adminPage, db }) => {
    const id = await createMeeting(db);
    meetingIds.push(id);
    await adminPage.goto(meetingUrl(id));

    await adminPage.getByRole("button", { name: "Aloita kokous" }).click();

    await expect(adminPage.getByTestId("meeting-status")).toContainText("Käynnissä");
    await expect(logRow(adminPage, "Kokous alkoi")).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "Aloita tauko" })).toBeVisible();
  });

  test("checks in before the meeting and counts attendance from its actual start", async ({ adminPage, db }) => {
    const id = await createMeeting(db);
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    await adminPage.goto(meetingUrl(id));

    const search = adminPage.getByTestId("meeting-search");
    await search.fill(user.lastName);
    await expect(adminPage.getByTestId("search-result").filter({ hasText: user.displayName })).toBeVisible();
    await search.press("Enter");
    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Saapui ennen kokouksen alkua");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 0 vierasta");
    await expect(adminPage.getByText("Salissa nyt: 1")).toBeVisible();

    await adminPage.getByRole("button", { name: "Aloita kokous" }).click();
    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Paikalla");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");
    const [meeting] = await db.select().from(table.meeting).where(eq(table.meeting.id, id));
    if (!meeting?.startsAt) throw new Error("Meeting did not start");
    const response = await adminPage.request.get(`${meetingUrl(id)}/export?kind=attendees`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain(meeting.startsAt.toISOString());
  });

  test("checks people in long before the scheduled start", async ({ adminPage, db }) => {
    const id = await createMeeting(db);
    meetingIds.push(id);
    const scheduled = new Date(Date.now() + 14 * 86_400_000);
    // Times only bound back-dated corrections, never a live check-in
    await db
      .update(table.meeting)
      .set({ scheduledStartsAt: scheduled, createdAt: new Date(Date.now() + 86_400_000) })
      .where(eq(table.meeting.id, id));
    const guestName = `Aikainen ${suffix()}`;
    await adminPage.goto(meetingUrl(id));
    const search = adminPage.getByTestId("meeting-search");
    await search.fill(guestName);
    await expect(adminPage.getByTestId("search-result")).toContainText(guestName);
    await search.press("Enter");
    await expect(attendeeRow(adminPage, guestName)).toContainText("Saapui ennen kokouksen alkua");
  });

  test("checks a registered person in with Enter and undoes it from the log", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    await adminPage.goto(meetingUrl(id));

    const search = adminPage.getByTestId("meeting-search");
    await search.fill(user.lastName);
    await expect(adminPage.getByTestId("search-result").filter({ hasText: user.displayName })).toBeVisible();
    await search.press("Enter");

    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Paikalla");
    // A registry user without an active membership counts as a guest.
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");
    await expect(search).toHaveValue("");
    await expect(logRow(adminPage, user.displayName)).toContainText("saapui");

    await logRow(adminPage, user.displayName).getByRole("button", { name: "Kumoa merkintä" }).click();

    await expect(logRow(adminPage, user.displayName)).toContainText("Kumottu");
    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Poissa");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 0 vierasta");
  });

  test("shows a corrected no-membership entry in the page and attendance export", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    const attendeeId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const effectiveAt = new Date(Date.now() - 10 * 60_000);
    await db.insert(table.meetingAttendee).values({
      id: attendeeId,
      meetingId: id,
      userId: user.id,
      displayName: user.displayName,
      membershipTypeId: "varsinainen-jasen",
    });
    await db.insert(table.meetingAttendanceEvent).values({
      id: eventId,
      meetingId: id,
      attendeeId,
      direction: "in",
      source: "manual",
      membershipTypeId: "varsinainen-jasen",
      effectiveAt,
    });
    await db.insert(table.meetingAttendanceEventCorrection).values({
      id: crypto.randomUUID(),
      eventId,
      revision: 1,
      attendeeId,
      direction: "in",
      effectiveAt,
      membershipTypeId: null,
      voided: false,
      reason: "Membership was not active",
    });

    await adminPage.goto(meetingUrl(id));
    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Ei voimassa olevaa jäsenyyttä");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");
    const response = await adminPage.request.get(`${meetingUrl(id)}/export?kind=attendees`);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("Guest / no active membership");
  });

  test("keeps the actual start before recesses while allowing earlier check-ins", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const startedAt = new Date(Date.now() - 10 * 60_000);
    await db.insert(table.meetingRecess).values({
      id: crypto.randomUUID(),
      meetingId: id,
      mode: "track_exits",
      startedAt,
    });
    await adminPage.goto(meetingUrl(id));
    await adminPage.getByRole("button", { name: "Toiminnot" }).click();
    await adminPage.getByRole("menuitem", { name: "Muokkaa aikoja" }).click();
    const sheet = adminPage.getByRole("dialog", { name: "Kokouksen ajat" });
    const actualStart = sheet.getByLabel("Todellinen alkamisaika");

    await actualStart.fill("");
    await sheet.getByRole("button", { name: "Tallenna ajat" }).click();
    await expect(sheet).toBeVisible();
    await expect(adminPage.getByText("Actual start must be before the first recess")).toBeVisible();

    const afterRecess = await adminPage.evaluate(
      (time) => {
        const date = new Date(time);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      },
      startedAt.getTime() + 5 * 60_000,
    );
    await actualStart.fill(afterRecess);
    await sheet.getByRole("button", { name: "Tallenna ajat" }).click();
    await expect(sheet).toBeVisible();

    const attendeeId = crypto.randomUUID();
    await db.insert(table.meetingAttendee).values({ id: attendeeId, meetingId: id, displayName: "Early attendee" });
    await db.insert(table.meetingAttendanceEvent).values({
      id: crypto.randomUUID(),
      meetingId: id,
      attendeeId,
      direction: "in",
      source: "manual",
      effectiveAt: new Date(startedAt.getTime() - 5 * 60_000),
    });
    const afterEntry = await adminPage.evaluate(
      (time) => {
        const date = new Date(time);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      },
      startedAt.getTime() - 2 * 60_000,
    );
    await actualStart.fill(afterEntry);
    await sheet.getByRole("button", { name: "Tallenna ajat" }).click();
    await expect(sheet).toBeHidden();

    const [meeting] = await db.select().from(table.meeting).where(eq(table.meeting.id, id));
    expect(meeting?.startsAt?.getTime()).toBeGreaterThan(startedAt.getTime() - 5 * 60_000);
    expect(meeting?.startsAt?.getTime()).toBeLessThan(startedAt.getTime());
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");
  });

  test("adds a guest from the search box", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const guestName = `Vieras ${suffix()}`;
    await adminPage.goto(meetingUrl(id));

    const search = adminPage.getByTestId("meeting-search");
    await search.fill(guestName);
    await expect(adminPage.getByTestId("search-result")).toContainText(`Lisää "${guestName}" vieraaksi`);
    await search.press("Enter");

    const row = attendeeRow(adminPage, guestName);
    await expect(row).toContainText("Vieras");
    await expect(row).toContainText("Paikalla");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");
  });

  test("checks out during a short recess and resumes", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const guest = await createPresentGuest(db, id);
    await adminPage.goto(meetingUrl(id));
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");

    await adminPage.getByRole("button", { name: "Aloita tauko" }).click();
    await adminPage.getByRole("menuitem", { name: /Lyhyt tauko/ }).click();
    await expect(adminPage.getByTestId("meeting-status")).toContainText("Lyhyt tauko alkaen");
    await expect(logRow(adminPage, "Lyhyt tauko alkoi")).toBeVisible();

    await attendeeRow(adminPage, guest.displayName).getByRole("button", { name: "Merkitse poistuneeksi" }).click();

    await expect(logRow(adminPage, guest.displayName).filter({ hasText: "poistui" })).toContainText("lasketaan alkaen");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 0 vierasta");

    await adminPage.getByRole("button", { name: "Jatka kokousta" }).click();

    await expect(adminPage.getByTestId("meeting-status")).toContainText("Käynnissä");
    await expect(logRow(adminPage, "Tauko päättyi, kokous jatkuu")).toBeVisible();
  });

  test("corrects an action with a reason", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const guest = await createPresentGuest(db, id);
    await adminPage.goto(meetingUrl(id));

    await logRow(adminPage, guest.displayName).getByRole("button", { name: "Lisää toimintoja" }).click();
    await adminPage.getByRole("menuitem", { name: "Korjaa merkintä" }).click();
    const sheet = adminPage.getByRole("dialog", { name: "Korjaa merkintä" });
    await expect(sheet).toBeVisible();

    await sheet.getByLabel("Suunta").selectOption("out");
    await sheet.getByLabel("Korjauksen syy").fill("E2E-korjaus");
    await sheet.getByRole("button", { name: "Tallenna korjaus" }).click();

    await expect(sheet).toBeHidden();
    const row = logRow(adminPage, guest.displayName);
    await expect(row).toContainText("poistui");
    await expect(row).toContainText("Korjattu");
    await expect(adminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 0 vierasta");

    const [correction] = await db
      .select({ reason: table.meetingAttendanceEventCorrection.reason })
      .from(table.meetingAttendanceEventCorrection)
      .innerJoin(
        table.meetingAttendanceEvent,
        eq(table.meetingAttendanceEventCorrection.eventId, table.meetingAttendanceEvent.id),
      )
      .where(eq(table.meetingAttendanceEvent.meetingId, id));
    expect(correction?.reason).toBe("E2E-korjaus");
  });

  test("closes the meeting after confirming", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    await createPresentGuest(db, id);
    await adminPage.goto(meetingUrl(id));

    await adminPage.getByRole("button", { name: "Toiminnot" }).click();
    await adminPage.getByRole("menuitem", { name: "Sulje kokous" }).click();
    const dialog = adminPage.getByRole("alertdialog");
    await expect(dialog).toContainText("Suljetaanko kokous?");
    await dialog.getByRole("button", { name: "Sulje kokous" }).click();

    await expect(dialog).toBeHidden();
    await expect(adminPage.getByTestId("meeting-status")).toContainText("Suljettu");
    await expect(logRow(adminPage, "Kokous suljettiin")).toBeVisible();
    await expect(adminPage.getByTestId("meeting-search")).toBeHidden();
    await expect(adminPage.getByRole("button", { name: "Merkitse poistuneeksi" })).toHaveCount(0);
    // Reasoned corrections remain available after closing.
    await logRow(adminPage, "saapui").first().getByRole("button", { name: "Lisää toimintoja" }).click();
    await expect(adminPage.getByRole("menuitem", { name: "Korjaa merkintä" })).toBeVisible();
  });

  test("reopens a closed meeting, even days later", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    await db
      .update(table.meeting)
      .set({ createdAt: new Date(Date.now() - 3 * 86_400_000), closedAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(table.meeting.id, id));
    await adminPage.goto(meetingUrl(id));
    await expect(adminPage.getByTestId("meeting-search")).toBeHidden();

    await adminPage.getByRole("button", { name: "Toiminnot" }).click();
    await adminPage.getByRole("menuitem", { name: "Avaa kokous uudelleen" }).click();

    await expect(adminPage.getByTestId("meeting-search")).toBeVisible();
    const [meeting] = await db.select().from(table.meeting).where(eq(table.meeting.id, id));
    expect(meeting?.closedAt).toBeNull();
    const audit = await db.select().from(table.auditLog).where(eq(table.auditLog.targetId, id));
    expect(audit.map((row) => row.action)).toContain("meeting.reopen");
  });

  test("edits the scheduled start after check-ins before the meeting starts", async ({ adminPage, db }) => {
    const id = await createMeeting(db);
    meetingIds.push(id);
    await createPresentGuest(db, id);
    await adminPage.goto(meetingUrl(id));
    await adminPage.getByRole("button", { name: "Toiminnot" }).click();
    await adminPage.getByRole("menuitem", { name: "Muokkaa aikoja" }).click();
    const sheet = adminPage.getByRole("dialog", { name: "Kokouksen ajat" });
    const scheduled = await adminPage.evaluate(
      (time) => {
        const date = new Date(time);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      },
      Date.now() + 60 * 60_000,
    );
    await sheet.getByLabel("Suunniteltu alkamisaika").fill(scheduled);
    await sheet.getByRole("button", { name: "Tallenna ajat" }).click();
    await expect(sheet).toBeHidden();

    const [meeting] = await db.select().from(table.meeting).where(eq(table.meeting.id, id));
    expect(meeting?.scheduledStartsAt?.getTime()).toBeGreaterThan(Date.now());
    expect(meeting?.startsAt).toBeNull();
  });

  test("finds a registered person by full name and checks them in as a member", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    await adminPage.goto(meetingUrl(id));

    const search = adminPage.getByTestId("meeting-search");
    await search.fill(user.displayName);
    await expect(adminPage.getByTestId("search-result").first()).toContainText(user.displayName);
    await search.press("Enter");

    await expect(attendeeRow(adminPage, user.displayName)).toBeVisible();
    const attendees = await db.select().from(table.meetingAttendee).where(eq(table.meetingAttendee.meetingId, id));
    expect(attendees.map((attendee) => attendee.userId)).toEqual([user.id]);
  });

  test("keeps the first match selected when the pointer rests over the results", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    await adminPage.goto(meetingUrl(id));

    const search = adminPage.getByTestId("meeting-search");
    const results = adminPage.getByTestId("search-result");
    await search.fill(user.lastName);
    await results.last().hover();
    await search.fill("");
    await search.fill(user.lastName);

    await expect(results.first()).toHaveAttribute("aria-selected", "true");
    await expect(results.last()).toHaveAttribute("aria-selected", "false");
  });

  test("finds a present attendee by email and checks them out", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    const attendeeId = crypto.randomUUID();
    await db
      .insert(table.meetingAttendee)
      .values({ id: attendeeId, meetingId: id, userId: user.id, displayName: user.displayName });
    await db.insert(table.meetingAttendanceEvent).values({
      id: crypto.randomUUID(),
      meetingId: id,
      attendeeId,
      direction: "in",
      source: "manual",
      effectiveAt: new Date(Date.now() - 10 * 60_000),
    });
    await adminPage.goto(meetingUrl(id));

    const search = adminPage.getByTestId("meeting-search");
    await search.fill(`meeting-${user.id}@example.com`);
    const results = adminPage.getByTestId("search-result");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText(user.displayName);
    await search.press("Enter");

    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Poissa");
    const attendees = await db.select().from(table.meetingAttendee).where(eq(table.meetingAttendee.meetingId, id));
    expect(attendees).toHaveLength(1);
  });

  test("still allows guests when the registry fails to load", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    await adminPage.route("**/admin/meetings/users", (route) => route.fulfill({ status: 500 }));
    await adminPage.goto(meetingUrl(id));
    await expect(adminPage.getByText("Jäsenrekisterin lataus epäonnistui")).toBeVisible();

    const guestName = `Vieras ${suffix()}`;
    const search = adminPage.getByTestId("meeting-search");
    await search.fill(guestName);
    await expect(adminPage.getByTestId("search-result")).toContainText(`Lisää "${guestName}" vieraaksi`);
    await search.press("Enter");
    await expect(attendeeRow(adminPage, guestName)).toBeVisible();
  });

  test("does not offer a second guest with an existing guest's name", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const guest = await createPresentGuest(db, id);
    await adminPage.goto(meetingUrl(id));
    await expect(adminPage.getByText("Enter merkitsee")).toBeVisible();

    await adminPage.getByTestId("meeting-search").fill(guest.displayName);
    const results = adminPage.getByTestId("search-result");
    await expect(results).toHaveCount(1);
    await expect(results).toContainText("Merkitse poistuneeksi");
  });

  test("does not offer an email address as a guest name", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    await adminPage.goto(meetingUrl(id));
    await expect(adminPage.getByText("Enter merkitsee")).toBeVisible();

    const search = adminPage.getByTestId("meeting-search");
    await search.fill(`nobody-${suffix()}@example.com`);
    await expect(adminPage.getByTestId("search-result")).toHaveCount(0);
    await search.press("Enter");
    const attendees = await db.select().from(table.meetingAttendee).where(eq(table.meetingAttendee.meetingId, id));
    expect(attendees).toHaveLength(0);
  });

  async function editAttendee(page: Page, name: string) {
    await attendeeRow(page, name).getByRole("button", { name: "Lisää toimintoja" }).click();
    await page.getByRole("menuitem", { name: "Muokkaa henkilöä" }).click();
    return page.getByTestId("attendee-sheet");
  }

  test("renames a mistyped guest", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const guest = await createPresentGuest(db, id);
    await adminPage.goto(meetingUrl(id));

    const sheet = await editAttendee(adminPage, guest.displayName);
    const fixedName = `Korjattu ${suffix()}`;
    await sheet.getByLabel("Vieraan nimi tai jäsenen haku").fill(fixedName);
    await sheet.getByLabel("Korjauksen syy").fill("Typo at the door");
    await sheet.getByRole("button", { name: "Tallenna korjaus" }).click();

    await expect(attendeeRow(adminPage, fixedName)).toContainText("Paikalla");
    await expect(attendeeRow(adminPage, guest.displayName)).toHaveCount(0);
    const audit = await db.select().from(table.auditLog).where(eq(table.auditLog.targetId, guest.attendeeId));
    expect(audit.map((row) => row.action)).toEqual(["meeting.attendee_update"]);
  });

  test("links a guest to a member and merges with the member's existing row", async ({ adminPage, db }) => {
    const id = await createMeeting(db, { started: true });
    meetingIds.push(id);
    const user = await createUser(db);
    userIds.push(user.id);
    const guest = await createPresentGuest(db, id);
    const memberRowId = crypto.randomUUID();
    await db
      .insert(table.meetingAttendee)
      .values({ id: memberRowId, meetingId: id, userId: user.id, displayName: user.displayName });
    await adminPage.goto(meetingUrl(id));

    const sheet = await editAttendee(adminPage, guest.displayName);
    await sheet.getByLabel("Vieraan nimi tai jäsenen haku").fill(user.lastName);
    await sheet.getByTestId("attendee-member-option").filter({ hasText: user.displayName }).click();
    await expect(sheet).toContainText("on jo tässä kokouksessa");
    await sheet.getByLabel("Korjauksen syy").fill("Member was added as a guest");
    await sheet.getByRole("button", { name: "Tallenna korjaus" }).click();

    await expect(attendeeRow(adminPage, user.displayName)).toContainText("Paikalla");
    const attendees = await db.select().from(table.meetingAttendee).where(eq(table.meetingAttendee.meetingId, id));
    expect(attendees.map((attendee) => attendee.id)).toEqual([memberRowId]);
    const events = await db
      .select()
      .from(table.meetingAttendanceEvent)
      .where(eq(table.meetingAttendanceEvent.meetingId, id));
    expect(events.every((event) => event.attendeeId === memberRowId)).toBe(true);
  });
});

test.describe("Meeting attendance as read-only admin", () => {
  let meetingId: string | null = null;

  test.afterEach(async ({ db }) => {
    if (meetingId) await deleteMeetings(db, [meetingId]);
    meetingId = null;
  });

  test("sees the meeting without any actions", async ({ readonlyAdminPage, db }) => {
    meetingId = await createMeeting(db, { started: true });
    await createPresentGuest(db, meetingId);
    await readonlyAdminPage.goto(meetingUrl(meetingId));

    await expect(readonlyAdminPage.getByTestId("admin-meeting-page")).toBeVisible();
    await expect(readonlyAdminPage.getByTestId("present-count")).toHaveText("Paikalla: 0 jäsentä, 1 vierasta");
    await expect(readonlyAdminPage.getByTestId("attendee-row")).toHaveCount(1);
    await expect(readonlyAdminPage.getByTestId("meeting-search")).toHaveCount(0);
    await expect(readonlyAdminPage.getByRole("button", { name: "Aloita tauko" })).toHaveCount(0);
    await expect(readonlyAdminPage.getByRole("button", { name: "Toiminnot" })).toHaveCount(0);
    await expect(readonlyAdminPage.getByRole("button", { name: "Korjaa merkintä" })).toHaveCount(0);
  });
});
