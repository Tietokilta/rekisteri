import { error } from "@sveltejs/kit";
import Papa from "papaparse";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import { getMeetingState } from "$lib/server/attendance/meeting";
import { userHasAdminAccess } from "$lib/server/auth/admin";

export const GET: RequestHandler = async (event) => {
  if (!event.locals.session || !userHasAdminAccess(event.locals.user)) error(404, "Not found");
  const meeting = await db.query.meeting.findFirst({ where: { id: event.params.id } });
  if (!meeting) error(404, "Meeting not found");
  const state = await getMeetingState(meeting.id, meeting.startsAt);
  const kind = event.url.searchParams.get("kind");
  if (kind !== "attendees" && kind !== "events" && kind !== "corrections" && kind !== "recesses")
    error(400, "Invalid export kind");
  const typeRows = await db.query.membershipType.findMany();
  const typeName = (id: string | null) => {
    if (!id) return "Guest / no active membership";
    return typeRows.find((type) => type.id === id)?.name.fi ?? id;
  };
  const attendeeById = new Map(state.attendees.map((person) => [person.id, person]));
  const resolvedById = new Map(state.resolvedEvents.map((item) => [item.id, item]));
  const warningsByEventId = new Map(state.warnings.map((warning) => [warning.eventId, warning.code]));
  const effectsById = new Map(state.projectedEvents.map((item) => [item.id, item.effectiveAt]));
  const rows: Array<Array<string | number | null | undefined>> =
    kind === "attendees"
      ? [
          [
            "Meeting",
            "Created",
            "Scheduled start",
            "Actual start",
            "Name",
            "Membership type at last entry",
            "First entry",
            "Last exit",
            "Present at export",
          ],
          ...state.attendees
            .filter((person) => state.everPresent.includes(person.id))
            .map((person) => {
              const events = state.projectedEvents
                .filter((item) => item.attendeeId === person.id)
                .toSorted((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
              return [
                meeting.title,
                meeting.createdAt.toISOString(),
                meeting.scheduledStartsAt?.toISOString(),
                meeting.startsAt?.toISOString(),
                person.displayName,
                typeName(
                  Object.hasOwn(state.membershipTypeByAttendee, person.id)
                    ? (state.membershipTypeByAttendee[person.id] ?? null)
                    : person.membershipTypeId,
                ),
                events.find((item) => item.direction === "in")?.effectiveAt.toISOString(),
                events.findLast((item) => item.direction === "out")?.effectiveAt.toISOString(),
                state.present.includes(person.id) ? "Yes" : "No",
              ];
            }),
        ]
      : kind === "events"
        ? [
            [
              "Meeting",
              "Created",
              "Scheduled start",
              "Actual start",
              "Event ID",
              "Original effective time",
              "Current effective time",
              "Attendance effect time",
              "Recorded time",
              "Original name",
              "Current name",
              "Membership type at current entry",
              "Original direction",
              "Current direction",
              "Source",
              "Operator ID",
              "Reason",
              "Undone",
              "Warning",
            ],
            ...state.events.map((item) => {
              const current = resolvedById.get(item.id);
              return [
                meeting.title,
                meeting.createdAt.toISOString(),
                meeting.scheduledStartsAt?.toISOString(),
                meeting.startsAt?.toISOString(),
                item.id,
                item.effectiveAt.toISOString(),
                current?.effectiveAt.toISOString(),
                effectsById.get(item.id)?.toISOString(),
                item.recordedAt.toISOString(),
                attendeeById.get(item.attendeeId)?.displayName,
                current ? attendeeById.get(current.attendeeId)?.displayName : null,
                current?.direction === "in" ? typeName(current.membershipTypeId) : "",
                item.direction,
                current?.direction,
                item.source,
                item.actorId,
                item.note,
                current?.voided ? "Yes" : "No",
                warningsByEventId.get(item.id),
              ];
            }),
          ]
        : kind === "corrections"
          ? [
              [
                "Meeting",
                "Event ID",
                "Revision",
                "Recorded time",
                "Operator ID",
                "Name",
                "Direction",
                "Effective time",
                "Membership type at entry",
                "Undone",
                "Reason",
              ],
              ...state.corrections.map((item) => [
                meeting.title,
                item.eventId,
                item.revision,
                item.recordedAt.toISOString(),
                item.actorId,
                attendeeById.get(item.attendeeId)?.displayName,
                item.direction,
                item.effectiveAt.toISOString(),
                item.direction === "in" ? typeName(item.membershipTypeId) : "",
                item.voided ? "Yes" : "No",
                item.reason,
              ]),
            ]
          : [
              ["Meeting", "Recess ID", "Mode", "Start", "End", "Cancelled", "Started by", "Ended by"],
              ...state.recesses.map((item) => [
                meeting.title,
                item.id,
                item.mode,
                item.startedAt.toISOString(),
                item.endedAt?.toISOString(),
                item.cancelledAt?.toISOString(),
                item.startedBy,
                item.endedBy,
              ]),
            ];
  const csv = Papa.unparse(rows, { quotes: true, escapeFormulae: true });
  return new Response("\u{FEFF}" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="meeting-${meeting.id}-${kind}.csv"`,
      "cache-control": "no-store",
    },
  });
};
