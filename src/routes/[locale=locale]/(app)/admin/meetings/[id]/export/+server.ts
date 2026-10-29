import { error } from "@sveltejs/kit";
import Papa from "papaparse";
import type { RequestHandler } from "./$types";
import { db } from "#lib/server/db/index.js";
import { getMeetingState } from "#lib/server/attendance/meeting.js";
import { userHasAdminAccess } from "#lib/server/auth/admin.js";
import { getLL } from "#lib/server/i18n.js";
import { meetingAttendanceSummary, meetingPhysicalEvents } from "#lib/shared/meeting-attendance.js";
import { singleLine } from "#lib/shared/name.js";

// Swedish locale formats as "YYYY-MM-DD HH:MM:SS", which spreadsheets parse as a date and time
const helsinkiTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Helsinki",
  dateStyle: "short",
  timeStyle: "medium",
});

function slug(text: string) {
  return text
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

/** Chronological attendance log in Finnish, for meeting minutes and for continuing in a spreadsheet. */
export const GET: RequestHandler = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) error(404, "Not found");
  const meeting = await db.query.meeting.findFirst({ where: { id: event.params.id } });
  if (!meeting) error(404, "Meeting not found");
  const state = await getMeetingState(meeting.id, meeting.startsAt);
  const LL = getLL("fi");
  const typeRows = await db.query.membershipType.findMany();
  const typeName = (id: string | null) =>
    id ? (typeRows.find((type) => type.id === id)?.name.fi ?? id) : LL.admin.meetings.noMembership();
  const nameById = new Map(state.attendees.map((person) => [person.id, singleLine(person.displayName)]));

  // Rows at the same instant keep this order: a recess start precedes the exits it causes
  const log: Array<{ at: Date; name?: string; action: string; type?: string }> = [];
  if (meeting.startsAt) log.push({ at: meeting.startsAt, action: "kokous alkoi" });
  for (const recess of state.recesses) {
    if (recess.cancelledAt) continue;
    log.push({ at: recess.startedAt, action: recess.mode === "reset_all" ? "pitkä tauko alkoi" : "lyhyt tauko alkoi" });
    if (recess.endedAt) log.push({ at: recess.endedAt, action: "tauko päättyi" });
  }
  // A long recess checks everyone out, so it gets an exit row per person. Only rows that change who is in the
  // room are "saapui"/"poistui", so counting entries minus exits matches the room. An exit while already out is
  // left out, and a second entry only shows a changed membership type
  const activeEvents = state.resolvedEvents.filter((item) => !item.voided);
  const typeInRoom = new Map<string, string | null>();
  for (const item of meetingPhysicalEvents(activeEvents, state.recesses).toSorted(
    (a, b) =>
      a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
      a.recordedAt.getTime() - b.recordedAt.getTime() ||
      a.id.localeCompare(b.id),
  )) {
    const name = nameById.get(item.attendeeId);
    if (item.direction === "out") {
      if (typeInRoom.delete(item.attendeeId)) log.push({ at: item.effectiveAt, name, action: "poistui" });
      continue;
    }
    const type = item.membershipTypeId ?? null;
    let action: string | null = "saapui";
    if (typeInRoom.has(item.attendeeId)) action = typeInRoom.get(item.attendeeId) === type ? null : "jäsenyys muuttui";
    typeInRoom.set(item.attendeeId, type);
    if (action) log.push({ at: item.effectiveAt, name, action, type: typeName(type) });
  }
  if (meeting.closedAt) log.push({ at: meeting.closedAt, action: "kokous päättyi" });

  // Same count as the meeting page: who attended at all once closed, otherwise who is present now
  const counted = meeting.closedAt
    ? Object.keys(meetingAttendanceSummary(state.projectedEvents, meeting.closedAt))
    : state.present;
  const members = state.attendees.filter(
    (person) =>
      counted.includes(person.id) &&
      (Object.hasOwn(state.membershipTypeByAttendee, person.id)
        ? state.membershipTypeByAttendee[person.id]
        : person.membershipTypeId),
  ).length;
  const count = { members: String(members), guests: String(counted.length - members) };

  const csv = Papa.unparse(
    [
      ["Aika", "Nimi", "Tapahtuma", "Jäsenyystyyppi"],
      ...log
        .toSorted((a, b) => a.at.getTime() - b.at.getTime())
        .map((row) => [helsinkiTime.format(row.at), row.name, row.action, row.type]),
      [],
      [meeting.closedAt ? LL.admin.meetings.attendedTotal(count) : LL.admin.meetings.presentNow(count)],
    ],
    { quotes: true, escapeFormulae: true },
  );
  const date = helsinkiTime.format(meeting.startsAt ?? meeting.scheduledStartsAt ?? meeting.createdAt).slice(0, 10);
  return new Response("\u{FEFF}" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug(meeting.title) || "kokous"}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
};
