import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import { eq, and, asc } from "drizzle-orm";

interface AttendanceSegment {
  checkIn: Date;
  checkOut: Date | null;
  durationMinutes: number | null;
}

interface UserAttendanceData {
  userId: string;
  email: string;
  name: string;
  segments: AttendanceSegment[];
  totalDurationMinutes: number;
}

/**
 * Calculates duration between two dates in minutes.
 */
function calculateDuration(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Formats duration in minutes to "Xh Ym" format.
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

/**
 * Processes attendance events into segments for each user.
 */
function processAttendanceData(
  events: Array<{
    userId: string;
    eventType: "CHECK_IN" | "CHECK_OUT" | "RECESS_START" | "RECESS_END" | "START" | "FINISH";
    timestamp: Date;
    user: {
      email: string;
      firstNames: string | null;
      lastName: string | null;
    };
  }>,
): UserAttendanceData[] {
  const userMap = new Map<string, UserAttendanceData>();

  for (const event of events) {
    let userData = userMap.get(event.userId);

    if (!userData) {
      userData = {
        userId: event.userId,
        email: event.user.email,
        name:
          event.user.firstNames && event.user.lastName
            ? `${event.user.firstNames} ${event.user.lastName}`
            : event.user.email,
        segments: [],
        totalDurationMinutes: 0,
      };
      userMap.set(event.userId, userData);
    }

    if (event.eventType === "CHECK_IN") {
      // Start a new segment
      userData.segments.push({
        checkIn: event.timestamp,
        checkOut: null,
        durationMinutes: null,
      });
    } else if (event.eventType === "CHECK_OUT") {
      // Close the most recent open segment
      const openSegment = userData.segments.find((s) => s.checkOut === null);
      if (openSegment) {
        openSegment.checkOut = event.timestamp;
        openSegment.durationMinutes = calculateDuration(openSegment.checkIn, event.timestamp);
        userData.totalDurationMinutes += openSegment.durationMinutes;
      }
    }
  }

  return Array.from(userMap.values()).toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * Converts attendance data to CSV format.
 */
function generateCSV(attendanceData: UserAttendanceData[], meetingName: string): string {
  const lines: string[] = [
    `Meeting: ${meetingName}`,
    `Export Date: ${new Date().toISOString()}`,
    "", // Empty line
    "Name,Email,Segment #,Check-In,Check-Out,Duration,Total Duration,Total Segments",
  ];

  // Data rows
  for (const user of attendanceData) {
    if (user.segments.length > 0) {
      for (let i = 0; i < user.segments.length; i++) {
        const segment = user.segments[i];
        if (!segment) continue;

        const row = [
          `"${user.name}"`,
          `"${user.email}"`,
          (i + 1).toString(),
          segment.checkIn.toISOString(),
          segment.checkOut ? segment.checkOut.toISOString() : "In Progress",
          segment.durationMinutes === null ? "In Progress" : formatDuration(segment.durationMinutes),
          i === 0 ? formatDuration(user.totalDurationMinutes) : "", // Only show total on first row
          i === 0 ? user.segments.length.toString() : "", // Only show segment count on first row
        ];
        lines.push(row.join(","));
      }
    } else {
      // User with no segments (shouldn't happen in normal flow)
      lines.push(`"${user.name}","${user.email}",0,,,0m,0m,0`);
    }
  }

  return lines.join("\n");
}

/**
 * GET /attendees/export - Export attendance data as CSV.
 *
 * Only accessible to admin users.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.isAdmin) {
    error(403, "Forbidden");
  }

  // Fetch meeting
  const meeting = await db.query.meeting.findFirst({
    where: eq(table.meeting.id, params.id),
  });

  if (!meeting) {
    error(404, "Meeting not found");
  }

  // Fetch all attendance events for this meeting
  const events = await db.query.attendance.findMany({
    where: and(eq(table.attendance.meetingId, params.id)),
    orderBy: [asc(table.attendance.timestamp)],
    with: {
      user: {
        columns: {
          email: true,
          firstNames: true,
          lastName: true,
        },
      },
    },
  });

  // Process attendance data
  const attendanceData = processAttendanceData(events);

  // Generate CSV
  const csv = generateCSV(attendanceData, meeting.name);

  // Return CSV file
  const filename = `attendance-${meeting.name.replaceAll(/[^a-z0-9]/gi, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
};
