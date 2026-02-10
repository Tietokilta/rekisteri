import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { db } from "$lib/server/db";
import { eq, and } from "drizzle-orm";
import * as table from "$lib/server/db/schema";

export const load: PageServerLoad = async (event) => {
  if (!event.locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  const { id } = event.params;

  // Fetch meeting
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, id),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Fetch all attendance events for this meeting
  const attendanceEvents = await db.query.attendance.findMany({
    where: eq(table.attendance.meetingId, id),
    orderBy: (attendance, { asc }) => [asc(attendance.timestamp)],
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

  // Calculate current status for each user
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

  // Fetch all members with active memberships (for manual check-in)
  const activeMembers = await db.query.member.findMany({
    where: and(eq(table.member.status, "active")),
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

  // Filter out members who have already been to the meeting
  const attendedUserIds = new Set(attendees.map((a) => a.userId));
  const availableForCheckIn = activeMembers
    .filter((m) => !attendedUserIds.has(m.userId))
    .map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.firstNames && m.user.lastName ? `${m.user.firstNames} ${m.user.lastName}` : m.user.email,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));

  return {
    meeting,
    attendees,
    availableForCheckIn,
    stats: {
      currentlyIn,
      totalAttended,
    },
  };
};
