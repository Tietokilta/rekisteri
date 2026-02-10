import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, asc } from "drizzle-orm";
import { verifyShareToken } from "$lib/server/attendance/share-token";

export const load: PageServerLoad = async ({ params }) => {
  // Verify share token and get meeting ID
  const meetingId = await verifyShareToken(params.token);

  if (!meetingId) {
    error(404, "Invalid or expired share link");
  }

  // Fetch meeting
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, meetingId),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Fetch all attendance events for this meeting
  const attendanceEvents = await db.query.attendance.findMany({
    where: eq(table.attendance.meetingId, meetingId),
    orderBy: [asc(table.attendance.timestamp)],
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          firstNames: true,
          lastName: true,
        },
      },
    },
  });

  // Calculate current status for each user (same logic as attendees page)
  const userAttendance = new Map<
    string,
    {
      userId: string;
      email: string;
      name: string;
      isCurrentlyIn: boolean;
      checkInCount: number;
      lastCheckIn: Date | null;
      lastCheckOut: Date | null;
    }
  >();

  for (const event of attendanceEvents) {
    const existing = userAttendance.get(event.userId);
    const name =
      event.user.firstNames && event.user.lastName
        ? `${event.user.firstNames} ${event.user.lastName}`
        : event.user.email;

    if (existing) {
      if (event.eventType === "CHECK_IN") {
        existing.isCurrentlyIn = true;
        existing.checkInCount++;
        existing.lastCheckIn = event.timestamp;
      } else {
        existing.isCurrentlyIn = false;
        existing.lastCheckOut = event.timestamp;
      }
    } else {
      userAttendance.set(event.userId, {
        userId: event.userId,
        email: event.user.email,
        name,
        isCurrentlyIn: event.eventType === "CHECK_IN",
        checkInCount: event.eventType === "CHECK_IN" ? 1 : 0,
        lastCheckIn: event.eventType === "CHECK_IN" ? event.timestamp : null,
        lastCheckOut: event.eventType === "CHECK_OUT" ? event.timestamp : null,
      });
    }
  }

  // Convert to array and sort by name
  const attendees = Array.from(userAttendance.values()).toSorted((a, b) => a.name.localeCompare(b.name));

  // Calculate summary stats
  const currentlyIn = attendees.filter((a) => a.isCurrentlyIn).length;
  const totalAttended = attendees.length;

  return {
    meeting,
    attendees,
    stats: {
      currentlyIn,
      totalAttended,
    },
  };
};
