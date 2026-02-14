import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { eq } from "drizzle-orm";
import * as table from "$lib/server/db/schema";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  const { id } = event.params;

  // Fetch meeting with all related events
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, id),
    with: {
      events: {
        orderBy: (events, { desc }) => [desc(events.timestamp)],
      },
    },
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Count current attendees (checked in but not out)
  const attendanceEvents = await db.query.attendance.findMany({
    where: eq(table.attendance.meetingId, id),
    orderBy: (attendance, { asc }) => [asc(attendance.timestamp)],
  });

  const currentlyIn = new Set<string>();
  for (const event of attendanceEvents) {
    if (event.eventType === "check_in") {
      currentlyIn.add(event.userId);
    } else if (event.eventType === "check_out") {
      currentlyIn.delete(event.userId);
    }
  }

  return {
    meeting,
    currentAttendeeCount: currentlyIn.size,
  };
};
