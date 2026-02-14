import { db } from "../../src/lib/server/db";
import * as table from "../../src/lib/server/db/schema";
import { eq, asc } from "drizzle-orm";
import type { User } from "../../src/lib/server/db/schema";
import { generateQrToken } from "../../src/lib/server/attendance/qr-token";

/**
 * Test helper for simulating attendance flows without QR scanning.
 *
 * Provides methods to:
 * - Check in/out users
 * - Transition meeting states
 * - Query current attendees
 * - Simulate complete visits
 */
export class AttendanceTestHelper {
  private meetingId: string;
  private adminUserId: string;

  constructor(meetingId: string, adminUserId: string) {
    this.meetingId = meetingId;
    this.adminUserId = adminUserId;
  }

  /**
   * Simulate a user checking in (bypasses QR scan).
   *
   * @param userId - User ID to check in
   * @param timestamp - Optional timestamp (defaults to now)
   */
  async checkIn(userId: string, timestamp?: Date): Promise<void> {
    await db.insert(table.attendance).values({
      id: crypto.randomUUID(),
      meetingId: this.meetingId,
      userId,
      eventType: "check_in",
      scanMethod: "manual",
      scannedBy: this.adminUserId,
      timestamp: timestamp || new Date(),
    });
  }

  /**
   * Simulate a user checking out.
   *
   * @param userId - User ID to check out
   * @param timestamp - Optional timestamp (defaults to now)
   */
  async checkOut(userId: string, timestamp?: Date): Promise<void> {
    await db.insert(table.attendance).values({
      id: crypto.randomUUID(),
      meetingId: this.meetingId,
      userId,
      eventType: "check_out",
      scanMethod: "manual",
      scannedBy: this.adminUserId,
      timestamp: timestamp || new Date(),
    });
  }

  /**
   * Simulate a complete visit (check-in + check-out).
   *
   * @param userId - User ID
   * @param checkInTime - Check-in timestamp
   * @param checkOutTime - Check-out timestamp
   */
  async visit(userId: string, checkInTime: Date, checkOutTime: Date): Promise<void> {
    await this.checkIn(userId, checkInTime);
    await this.checkOut(userId, checkOutTime);
  }

  /**
   * Get current attendees (checked in but not out).
   *
   * @returns Array of user IDs currently checked in
   */
  async getCurrentAttendees(): Promise<string[]> {
    const events = await db.query.attendance.findMany({
      where: eq(table.attendance.meetingId, this.meetingId),
      orderBy: [asc(table.attendance.timestamp)],
    });

    const currentlyIn = new Set<string>();

    for (const event of events) {
      if (event.eventType === "check_in") {
        currentlyIn.add(event.userId);
      } else if (event.eventType === "check_out") {
        currentlyIn.delete(event.userId);
      }
    }

    return Array.from(currentlyIn);
  }

  /**
   * Transition meeting state.
   *
   * @param status - New meeting status
   * @param notes - Optional notes for the event
   */
  async transitionMeeting(status: "upcoming" | "ongoing" | "recess" | "finished", notes?: string): Promise<void> {
    const eventTypeMap = {
      ongoing: "start",
      recess: "recess_start",
      finished: "finish",
    } as const;

    // Update meeting status
    await db.update(table.meeting).set({ status }).where(eq(table.meeting.id, this.meetingId));

    // Record event if transitioning to ongoing, recess, or finished
    if (status !== "upcoming") {
      await db.insert(table.meetingEvent).values({
        id: crypto.randomUUID(),
        meetingId: this.meetingId,
        eventType: eventTypeMap[status],
        notes,
        timestamp: new Date(),
      });
    }

    // Update meeting timestamps
    if (status === "ongoing") {
      await db.update(table.meeting).set({ startedAt: new Date() }).where(eq(table.meeting.id, this.meetingId));
    } else if (status === "finished") {
      await db.update(table.meeting).set({ finishedAt: new Date() }).where(eq(table.meeting.id, this.meetingId));
    }
  }

  /**
   * Check out all attendees (for long recess scenario).
   *
   * Records a CHECK_OUT event for each currently checked-in user.
   */
  async checkOutAll(): Promise<void> {
    const currentlyIn = await this.getCurrentAttendees();
    const now = new Date();

    for (const userId of currentlyIn) {
      await this.checkOut(userId, now);
    }
  }
}

/**
 * Factory for creating test meetings.
 *
 * @param name - Meeting name
 * @returns Meeting ID
 */
export async function createTestMeeting(name: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(table.meeting).values({
    id,
    name,
    description: `Test meeting: ${name}`,
    status: "upcoming",
  });
  return id;
}

/**
 * Factory for creating test users with QR tokens.
 *
 * @param email - User email
 * @param name - User name
 * @param isAdmin - Whether user is admin (default: false)
 * @returns User object with QR token
 */
export async function createTestUser(email: string, name: string, isAdmin = false): Promise<User> {
  const id = crypto.randomUUID();
  const qrToken = generateQrToken();

  await db.insert(table.user).values({
    id,
    email,
    firstNames: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" ") || "User",
    isAdmin,
    qrToken: qrToken,
  });

  // Fetch the full user object
  const user = await db.query.user.findFirst({
    where: eq(table.user.id, id),
  });

  if (!user) {
    throw new Error("Failed to create test user");
  }

  return user;
}

/**
 * Clean up test meeting and all related data.
 *
 * @param meetingId - Meeting ID to delete
 */
export async function deleteTestMeeting(meetingId: string): Promise<void> {
  // Foreign key constraints with CASCADE will handle related records
  await db.delete(table.meeting).where(eq(table.meeting.id, meetingId));
}

/**
 * Clean up test user and all related data.
 *
 * @param userId - User ID to delete
 */
export async function deleteTestUser(userId: string): Promise<void> {
  // Foreign key constraints with CASCADE will handle related records
  await db.delete(table.user).where(eq(table.user.id, userId));
}
